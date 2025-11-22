# SMTP Email Configuration for Password Reset

## Quick Setup for Gmail

1. **Create a `.env` file in the `server` directory** (if you don't have one)

2. **Add these variables to your `.env` file:**

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## Gmail Setup Steps:

1. **Enable 2-Factor Authentication** on your Google account
2. **Generate an App Password:**
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Enter "StockMaster" as the name
   - Copy the generated 16-character password
   - Use this password as `SMTP_PASS` in your `.env` file

3. **Restart your server** after adding the SMTP configuration

## Alternative Email Services:

### Outlook/Hotmail:
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
```

### Yahoo:
```env
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_USER=your-email@yahoo.com
SMTP_PASS=your-app-password
```

### Custom SMTP Server:
```env
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASS=your-password
```

## Development Mode (No Email Setup Required)

If you don't configure SMTP settings, the OTP will be logged to the server console for development purposes. Check your server terminal output after requesting a password reset.

