Discord Data Package Location
=============================

This is the default location for your Discord data package.

Setup Instructions:
-------------------

1. Download your Discord data package:
   - Open Discord
   - Go to User Settings > Privacy & Safety
   - Scroll to "Request all of my Data"
   - Click "Request Data"
   - Wait for Discord to email you when ready (usually 24-48 hours)

2. Extract the downloaded package:
   - Download the package from the email link
   - Extract the ZIP file
   - Copy ALL contents to this directory (datapackage/)

3. Verify the structure:
   Your datapackage/ folder should contain:
   - messages/
   - account/
   - servers/
   - activity/
   - README.txt (from Discord)
   - And other folders from your Discord data

4. Run the application:
   docker-compose run --rm discord-dm-manager interactive

If you prefer a different location:
------------------------------------
Edit docker-compose.yml and change the volume mount:
  - /your/custom/path:/data/package
