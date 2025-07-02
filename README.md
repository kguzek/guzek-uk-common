# Guzek UK Common

## DEPRECATION NOTICE 2025-07-03

Guzek UK Common was made obsolete with the [integration of PayloadCMS](https://github.com/kguzek/guzek-uk-website/pull/18) into the Guzek UK website. This repository no longer serves any use.

## Intro

A repository of common modules and utilities for the Guzek UK Website, used on the various deployed servers.
The functionality of these utilities is based around a REST HTTP server, with a heavy focus on CRUD operations.

## Installation

The package is published on the NPM package registry.

```bash
npm install guzek-uk-common
```

## Usage

Below is a list of all modules available in this library.

### logger

Used for obtaining a logger instance. Usage:

```ts
import { getLogger } from "guzek-uk-common/logger";
const logger = getLogger(__filename);

logger.info("Hello, world!");
```

### maths

Used for Tu Lałem geographic calculations.

### models

Generic server-wide type definitions.

### sequelize

Model definitions for the database ORM.

### util

CRUD functions and general server-related functions.

### middleware

Exports an array factory containing middlewares which should be used on all servers. Usage:

```ts
import express from "express";
import { getMiddleware } from "guzek-uk-common/middleware";

const app = express();
app.use(getMiddleware());
```

`useMiddleware()` produces an array of the following middlewares, which shouldn't be accessed directly:

#### middleware/auth

Automatic request authentication and authorisation. If the request passes, this middleware adds the `user` object to the request object, to be used in later request handlers. Example:

```ts
import { UserObj } from "guzek-uk-common/models";

app.get("/my-uuid", (req, res) => {
  const user: UserObj | undefined = req.user;
  // If the authentication middleware was set to only allow logged in users
  // to access this endpoint, `user` will definitely be of type `UserObj`.
  res.status(200).send(`Your UUID is ${user?.uuid}!`);
});
```

#### middleware/headers

Adds `pragma` headers to all responses for proper caching.

#### middleware/logging

Logs all requests made to the server, along with IP and request body.
