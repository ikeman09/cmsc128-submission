#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { customerBackendStack } from '../lib/customer-backend-stack';
import { stationBackendStack} from "../lib/station-backend-stack";
import { cognitoStack } from "../lib/cognito-stack";
import { dealerCognitoStack } from "../lib/dealer-cognito-stack";

const app = new cdk.App();
new customerBackendStack(app, `customerBackendStack-${process.env.DEPLOYMENT_ENV}`, {
  stackName: `customerBackendStack-${process.env.DEPLOYMENT_ENV}`
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

new stationBackendStack(app, `stationBackendStack-${process.env.DEPLOYMENT_ENV}`, {
  stackName: `stationBackendStack-${process.env.DEPLOYMENT_ENV}`
})

new cognitoStack(app, `cognitoStack-${process.env.DEPLOYMENT_ENV}`, {
  stackName: `cognitoStack-${process.env.DEPLOYMENT_ENV}`
})

new dealerCognitoStack(app, `dealerCognitoStack-${process.env.DEPLOYMENT_ENV}`, {
  stackName: `dealerCognitoStack-${process.env.DEPLOYMENT_ENV}`
})
