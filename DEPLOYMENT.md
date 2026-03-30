# Render Deployment Guide

## Step 1: Create Render Account
1. Go to [render.com](https://render.com)
2. Sign up with GitHub (recommended)

## Step 2: Create PostgreSQL Database
1. Dashboard → New → PostgreSQL
2. Name: `stackhire-db`
3. Database: `jobbot`
4. User: `jobbot`
5. Region: Choose closest to your users
6. Plan: **Free**
7. Click "Create Database"
8. Wait for it to provision (2-3 minutes)

## Step 3: Deploy Bot Service
1. Dashboard → New → Web Service
2. Connect your GitHub repository
3. Settings:
   - **Name**: `stackhire-bot`
   - **Runtime**: Docker
   - **Dockerfile Path**: `./Dockerfile`
   - **Plan**: Free
4. Add Environment Variables:
   - `BOT_TOKEN`: Your Telegram bot token from @BotFather
   - `DATABASE_URL`: Click "Connect Database" → Select `stackhire-db`
   - `OPERATOR_CHAT_ID`: Your Telegram chat ID
   - `SCRAPER_INTERVAL_HOURS`: `6`
   - `BOT_USERNAME`: `StackHireBot`
   - `ADZUNA_APP_ID`: Your Adzuna app ID
   - `ADZUNA_APP_KEY`: Your Adzuna app key
5. Click "Create Web Service"

## Step 4: Deploy Landing Page (Optional)
1. Dashboard → New → Web Service
2. Connect same repository
3. Settings:
   - **Name**: `stackhire-web`
   - **Runtime**: Node
   - **Build Command**: `cd web && npm install && npm run build`
   - **Start Command**: `cd web && npm start`
   - **Plan**: Free
4. Add Environment Variables:
   - `NEXT_PUBLIC_BOT_USERNAME`: `StackHireBot`
5. Click "Create Web Service"

## Step 5: Initialize Database
1. Go to your bot service logs
2. Wait for "Bot started successfully" message
3. Database tables will be created automatically on first run

## Important Notes

- Free tier sleeps after 15 minutes of inactivity
- First request after sleep takes ~30 seconds to wake up
- 750 hours/month free (enough for 1 service 24/7)
- Database has 1GB storage limit on free tier

## Troubleshooting

**Bot not responding?**
- Check Render logs for errors
- Verify BOT_TOKEN is correct
- Check DATABASE_URL is connected

**Database connection failed?**
- Ensure database is fully provisioned
- Check DATABASE_URL format
- Verify database is in same region

**Service keeps crashing?**
- Check Playwright dependencies in Dockerfile
- Verify all environment variables are set
- Check logs for specific error messages
