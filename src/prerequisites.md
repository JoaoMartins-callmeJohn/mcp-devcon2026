# Prerequisites

_Everything you need set up before starting the workshop_

## Tools & Software

Make sure you have the following installed:

- **Node.js 18+** - [https://nodejs.org](https://nodejs.org)
- **VS Code** - [https://code.visualstudio.com](https://code.visualstudio.com)
- **GitHub account** - [https://github.com](https://github.com), required for GitHub Copilot
- **GitHub Copilot enabled in VS Code**: sign in to your GitHub account in VS Code via **Accounts** (bottom-left avatar icon) and make sure Copilot is active. If the Copilot icon isn't visible, open the Extensions panel and install **GitHub Copilot** from the marketplace.

Verify your Node.js version:

```bash
node --version
```

You should see `v18.x.x` or higher.

## APS Account & Credentials Setup

You need an Autodesk account, an APS subscription, and a **Developer Hub**, the portal where you create and manage your APS apps.

**1. Sign in at aps.autodesk.com**

Go to [aps.autodesk.com](https://aps.autodesk.com) and sign in. If you don't have an account, click **Create account** and complete the form.

**2. Open the Developer Hubs page**

After signing in, click the **Developer hubs** button in the top-right corner. If you haven't set one up yet, you'll see:

> _"It seems you don't have a hub yet"_

**3. Get an APS plan**

Click **View options** and sign up for the free tier. No credit card required for the APIs used in this workshop.

**4. Create a Developer Hub**

Once you have a plan, create the hub from your Autodesk account:

1. Go to [manage.autodesk.com](https://manage.autodesk.com) and sign in with the same account
2. Click **Products and Services**, then the **Hubs** tab
3. Click **Create hub**
4. Select **APS Developer Hub** as the product
5. Enter a hub name (e.g. `devcon-workshop`) and click **Create & Activate**
6. Click your hub name to open the developer portal

**5. Create your application credentials**

Inside your developer hub:

1. Go to the **Applications** page
2. Click **Create application**
3. Enter a name (e.g. `devcon-workshop`)
4. Select **Server-to-Server App** for backend services that access APS APIs without user authentication
5. Click **Create**
6. Under **API Access**, select the APIs your app needs (at minimum: **Data Management**, **OSS**)
7. Click **Save changes**
8. Copy your **Client ID** and **Client Secret** from the app overview and save them. You will need them later to authenticate your MCP server with APS and call its APIs.

Keep your **Client ID** and **Client Secret** handy. You'll need them in Chapter 3 when setting up the APS server.
