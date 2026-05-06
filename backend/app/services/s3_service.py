import logging
from typing import Optional
import aioboto3

from app.services.system_settings_service import get_runtime_settings
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

class S3Service:
    def __init__(self, endpoint_url: str, access_key: str, secret_key: str, bucket: str, region: str):
        self.endpoint_url = endpoint_url
        self.access_key = access_key
        self.secret_key = secret_key
        self.bucket = bucket
        self.region = region
        self.session = aioboto3.Session()

    async def get_client(self):
        return self.session.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region,
        )

    async def generate_presigned_upload_url(self, object_name: str, expiration=3600) -> str:
        async with await self.get_client() as s3_client:
            try:
                response = await s3_client.generate_presigned_url(
                    "put_object",
                    Params={"Bucket": self.bucket, "Key": object_name},
                    ExpiresIn=expiration,
                )
                return response
            except Exception as e:
                logger.error(f"Error generating presigned URL: {e}")
                raise

    async def generate_presigned_download_url(self, object_name: str, expiration=3600) -> str:
        async with await self.get_client() as s3_client:
            try:
                response = await s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": self.bucket, "Key": object_name},
                    ExpiresIn=expiration,
                )
                return response
            except Exception as e:
                logger.error(f"Error generating presigned URL: {e}")
                raise

    async def download_file(self, object_name: str, file_path: str):
        async with await self.get_client() as s3_client:
            await s3_client.download_file(self.bucket, object_name, file_path)

    async def upload_file(self, file_path: str, object_name: str):
        async with await self.get_client() as s3_client:
            await s3_client.upload_file(file_path, self.bucket, object_name)

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
