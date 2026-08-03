# GitHub Actions Setup Instructions

## Required GitHub Secrets

To build the release APK in GitHub Actions, you need to add the following secrets to your repository:

### 1. UPLOAD_KEYSTORE_BASE64

This is your Android signing keystore encoded in base64.

**Value:** Copy the entire content from `keystore.txt` in your project root.

**How to add:**
1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `UPLOAD_KEYSTORE_BASE64`
5. Value: Paste the content from `keystore.txt`
6. Click "Add secret"

### 2. EXPO_PUBLIC_SUPABASE_URL

Your Supabase project URL.

**Value:** Found in your Supabase project settings (e.g., `https://xxxxx.supabase.co`)

### 3. EXPO_PUBLIC_SUPABASE_ANON_KEY

Your Supabase anonymous/public key.

**Value:** Found in your Supabase project settings under API → Project API keys → `anon public`

## After Setup

Once all secrets are added:
1. Push any commit to the `master` branch
2. The workflow will automatically build a release APK
3. The APK will be uploaded to a GitHub release tagged "latest"
4. Download the APK from the Releases page and install on your phone

## Important Notes

- **Delete `keystore.txt`** after copying the value to GitHub secrets (it contains sensitive data)
- The release APK will be properly signed and won't require Metro bundler
- The workflow runs on every push to the `master` branch
