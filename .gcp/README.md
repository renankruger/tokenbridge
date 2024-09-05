# Federator deployment

You (may) have many options to deploy the federator (in the future)

## On Google Cloud Run (with terraform)

There is infrastructure ready code to deploy the federator on cloud run, you just have to follow the steps below

### Setup a Google Platform Project and APIs

If you don't have a GCP project:
- Create a new project on Google Cloud Platform;
- Link a billing account;
Then:
- [Enable Artifact Registry API](https://cloud.google.com/artifact-registry/docs/enable-service#console);
- Enable PubSub API;
- Enable Cloud Run API;

### Build your artifacts

- Build and tag the federator image
```shell
docker build -t `{{repository-location}}`-docker.pkg.dev/`{{your-project}}`/`{{repository-name}}`/hathor-tokenbridge:latest .
```
- For the headless wallet, you need to create the new dockerfile with the plugin file and dependencies
```shell
FROM hathornetwork/hathor-wallet-headless:v0.22.0

RUN npm install @google-cloud/pubsub@^4.0.5

COPY ./hathor_pubsub.js ./src/plugins/hathor_pubsub.js
```
- And then build and tag the new image

```shell
docker build -t `{{repository-location}}`-docker.pkg.dev/`{{your-project}}`/`{{repository-name}}`/hathor-wallet-headless:latest .
```

### Deploy your artifacts to the artifact registry

- Go to https://console.cloud.google.com/artifacts?project=`{{your-project}}`
- Setup a new repository
- Format: Docker
```shell
docker push `{{repository-location}}`-docker.pkg.dev/`{{your-project}}`/`{{repository-name}}`/hathor-wallet-headless:latest
docker push `{{repository-location}}`-docker.pkg.dev/`{{your-project}}`/`{{repository-name}}`/hathor-tokenbridge:latest
```

### Run the deployment

You can run it from a remote repository like github, or locally

#### Remote repository - unavailable

#### Locally

- Install terraform
- Setup your variable files (copy .gcp/federator.tfvars.example and replace the values)
```shell
terraform apply --var-file=`{{your-var-file-name.tfvars}}`
```

## On AWS (with terraform) - unavailable

## On Azure (with terraform) - unavailable