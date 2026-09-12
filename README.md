# sennninnetwork

SenninNet 2.0 is an independent web-network style platform.

## Features

- Sennin Search
- Sennin Browser
- snn:// domains
- developer center
- site publishing
- Railway connection
- Render connection
- username/password accounts
- JWT authentication
- bcrypt password hashing
- Supabase PostgreSQL
- bookmarks
- search history
- developer statistics
- rate limiting
- Helmet
- CORS
- input validation

## Important

Supabase Auth is NOT used.

Supabase is used as the database.

Passwords are hashed by Node.js with bcrypt.

The Supabase service role key must only exist on the server.

Never put SUPABASE_SERVICE_ROLE_KEY into public/app.js or HTML.

## Installation

Install Node.js 18 or newer.

Open the SenninNet folder in a terminal.

Run:

npm install

## Supabase

1. Create a Supabase project.
2. Open SQL Editor.
3. Run all SQL in supabase.sql.
4. Open Project Settings.
5. Copy the Project URL.
6. Copy the server-side service role key.

## Environment variables

Create a file named:

.env

Copy the following:

PORT=3000
NODE_ENV=development

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

JWT_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_SECRET

CLIENT_URL=http://localhost:3000

Replace the Supabase values.

JWT_SECRET should be a long random value.

## Run

npm start

Then open:

http://localhost:3000

## Account

Open:

/developer.html

Create an account.

The account system is handled by Node.js.

Supabase Auth is not used.

## Sennin Domain

After login:

1. Open Developer.
2. Enter a domain name.
3. Check availability.
4. Get the domain.

Example:

snn://mysite

## Railway / Render

Deploy this project to Railway or Render.

Set the environment variables in the hosting provider.

The application uses the PORT environment variable provided by the host.

The server listens on:

0.0.0.0

## External hosting

A Sennin domain can point to an external HTTPS site.

Example:

snn://mysite

Target:

https://mysite-production.up.railway.app

or:

https://mysite.onrender.com

## Search

Sennin Search searches sites registered in SenninNet.

It is not a crawler for the entire public Internet.

## Security

The project includes:

- Helmet
- CORS
- rate limiting
- bcrypt password hashing
- HTTP-only authentication cookie
- JWT expiration
- input length limits
- URL validation
- local/private target URL blocking
- owner checks for developer resources

## Production

For production:

- use a strong JWT_SECRET
- use HTTPS
- set NODE_ENV=production
- keep the Supabase service role key secret
- configure CORS to the real frontend URL
- consider additional domain verification
- consider a dedicated isolated site execution environment

## Version

SenninNet 2.0.0
