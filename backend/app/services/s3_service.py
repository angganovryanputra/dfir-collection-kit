import asyncio
import logging
import os
from typing import Optional

import aioboto3

from app.services.system_settings_service import get_runtime_settings
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Files larger than this threshold are uploaded via the multipart API (5 MB).
_MULTIPART_THRESHOLD = 5 * 1024 * 1024
# Part size for multipart upload (8 MB per part).
_MULTIPART_PART_SIZE = 8 * 1024 * 1024


class S3Service:
    def __init__(self, endpoint_url: str, access_key: str, secret_key: str, bucket: str, region: str):
        self.endpoint_url = endpoint_url
        self.access_key = access_key
        self.secret_key = secret_key
        self.bucket = bucket
        self.region = region
        self.session = aioboto3.Session()

    def _client(self):
        return self.session.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region,
        )

    async def generate_presigned_upload_url(self, object_name: str, expiration: int = 3600) -> str:
        async with self._client() as s3_client:
            try:
                response = await s3_client.generate_presigned_url(
                    "put_object",
                    Params={"Bucket": self.bucket, "Key": object_name},
                    ExpiresIn=expiration,
                )
                return response
            except Exception as e:
                logger.error("Error generating presigned upload URL: %s", e)
                raise

    async def generate_presigned_download_url(self, object_name: str, expiration: int = 3600) -> str:
        async with self._client() as s3_client:
            try:
                response = await s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": self.bucket, "Key": object_name},
                    ExpiresIn=expiration,
                )
                return response
            except Exception as e:
                logger.error("Error generating presigned download URL: %s", e)
                raise

    async def download_file(self, object_name: str, file_path: str) -> None:
        async with self._client() as s3_client:
            await s3_client.download_file(self.bucket, object_name, file_path)

    async def upload_file(self, file_path: str, object_name: str) -> None:
        """Upload *file_path* to S3.

        Files smaller than ``_MULTIPART_THRESHOLD`` use a single PUT; larger
        files are split into ``_MULTIPART_PART_SIZE`` chunks via the multipart
        upload API so they never exceed the S3 5-GiB single-part limit and
        individual parts can be retried independently.
        """
        file_size = await asyncio.to_thread(os.path.getsize, file_path)
        if file_size <= _MULTIPART_THRESHOLD:
            async with self._client() as s3_client:
                await s3_client.upload_file(file_path, self.bucket, object_name)
            return

        await self._multipart_upload(file_path, object_name, file_size)

    async def _multipart_upload(self, file_path: str, object_name: str, file_size: int) -> None:
        """Stream *file_path* to S3 using the multipart upload API."""
        async with self._client() as s3_client:
            mpu = await s3_client.create_multipart_upload(Bucket=self.bucket, Key=object_name)
            upload_id = mpu["UploadId"]
            parts: list[dict] = []
            try:
                part_number = 1
                offset = 0

                def _read_chunk(path: str, off: int, size: int) -> bytes:
                    with open(path, "rb") as fh:
                        fh.seek(off)
                        return fh.read(size)

                while offset < file_size:
                    chunk_size = min(_MULTIPART_PART_SIZE, file_size - offset)
                    chunk = await asyncio.to_thread(_read_chunk, file_path, offset, chunk_size)
                    resp = await s3_client.upload_part(
                        Bucket=self.bucket,
                        Key=object_name,
                        PartNumber=part_number,
                        UploadId=upload_id,
                        Body=chunk,
                    )
                    parts.append({"PartNumber": part_number, "ETag": resp["ETag"]})
                    offset += chunk_size
                    part_number += 1
                    logger.debug(
                        "Multipart upload %s part %d/%d done",
                        object_name,
                        part_number - 1,
                        (file_size + _MULTIPART_PART_SIZE - 1) // _MULTIPART_PART_SIZE,
                    )

                await s3_client.complete_multipart_upload(
                    Bucket=self.bucket,
                    Key=object_name,
                    UploadId=upload_id,
                    MultipartUpload={"Parts": parts},
                )
                logger.info("Multipart upload complete: %s (%d bytes)", object_name, file_size)
            except Exception:
                logger.warning("Multipart upload failed for %s; aborting upload", object_name)
                try:
                    await s3_client.abort_multipart_upload(
                        Bucket=self.bucket, Key=object_name, UploadId=upload_id
                    )
                except Exception as abort_err:
                    logger.warning("Failed to abort multipart upload: %s", abort_err)
                raise


async def get_s3_service(db: AsyncSession) -> Optional[S3Service]:
    settings = await get_runtime_settings(db)
    if not settings.s3_enabled:
        return None

    return S3Service(
        endpoint_url=settings.s3_endpoint_url,
        access_key=settings.s3_access_key,
        secret_key=settings.s3_secret_key,
        bucket=settings.s3_bucket,
        region=settings.s3_region or "us-east-1",
    )
