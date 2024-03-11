# 🎞 btsotg

## YAY SAAS

SaaS offering hosted by us featuring recurrent movie nights, API integrations and AI-augmented suggestions based on previous choices, genres and critic scores.

## Features

- [x] Based on [Nuxt](https://nuxtjs.org/): no need to eject, fully upgradable, modular and able to pre-render certain routes
- [ ] Backed by and hosted on: [Firebase](https://firebase.google.com/): authentication, Firestore realtime DB and CDN
- [ ] Backend agnostic: remove the usage of Firebase constraint and allow other realtime (deepstreamHub, Sockets.IO) and non-realtime (REST APIs, GraphQL) data sources

## Firebase Setup

1. Create a new project on Firebase [Firebase](https://firebase.google.com/).
2. Enable Authentication, Cloud Firestore, and Hosting.
3. Copy the `.env.example` to a `.env` file.
4. Fill in the environmental variables with your own.
5. Build and deploy the project.

## Netlify Setup

## Local Development Setup

``` bash
# install dependencies
$ yarn install

# serve with hot reload at localhost:3000
$ yarn run dev

# generate static project
$ yarn run generate
```yarn