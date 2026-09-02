import urllib.request
import os
import zipfile
import shutil

go_version = "1.23.0"
go_zip = fr"C:\Users\angga\Downloads\go{go_version}.windows-amd64.zip"
go_install_dir = fr"C:\Users\angga\go"
go_url = f"https://go.dev/dl/go{go_version}.windows-amd64.zip"

# Download
print(f"Downloading Go {go_version}...")
urllib.request.urlretrieve(go_url, go_zip)
print(f"Downloaded to {go_zip}")

# Extract
print(f"Extracting to {go_install_dir}...")
if os.path.exists(go_install_dir):
    shutil.rmtree(go_install_dir)
with zipfile.ZipFile(go_zip, 'r') as zip_ref:
    zip_ref.extractall(r"C:\Users\angga")
print(f"Go extracted to {go_install_dir}")

# Verify
go_exe = os.path.join(go_install_dir, "bin", "go.exe")
if os.path.exists(go_exe):
    print(f"Go installed successfully at {go_exe}")
else:
    print("ERROR: Go executable not found!")
