import {Stack, StackProps, Duration} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as kms from 'aws-cdk-lib/aws-kms'
import * as iam from 'aws-cdk-lib/aws-iam'
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class cognitoStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const EnvVars = require('./envConfig')
    console.table(EnvVars)

    // KMS Key
    const key = new kms.Key(this, 'customSenderKey', {
      enableKeyRotation: false
    })

    // KMS Alias
    const alias = new kms.Alias(this, 'customSenderKeyAlias', {
      aliasName: EnvVars.KMS_KEY_ALIAS,
      targetKey: key
    })

    // Lambda layers
    const commonLibs = new lambda.LayerVersion(this, 'commonLibs', {
      code: lambda.Code.fromAsset('src/layers/commonLibs'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_16_X],
      description: "A layer for all nodejs lambda functions"
    })

    // Lambda triggers

    // Pre Sign Up Customer
    const preSignUp = new lambda.Function(this, "preSignUpCustomer", {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'preSignUp.handler',
      code: lambda.Code.fromAsset('src/functions/lambdaTriggers/preSignUp'),
      timeout: Duration.seconds(60),
      layers: [commonLibs],
      environment: {
        'DEPLOYMENT_ENV': EnvVars.DEPLOYMENT_ENV,
        'SENDGRID_API_KEY': EnvVars.SENDGRID_API_KEY,
        'KMS_KEY_ARN': key.keyArn,
        'KMS_KEY_ALIAS': alias.aliasName,
      }
    })

    // IAM policy to allow preSignUp to invoke of participant function
    const preSignUpInvokeParticipantPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction', 'lambda:InvokeAsync'],
      resources: [`arn:aws:lambda:${EnvVars.AWS_REGION}:${EnvVars.AWS_ACCOUNT}:function:customer-${EnvVars.DEPLOYMENT_ENV}`]
    })

    // Attach role to invoker lambda preSignUp
    preSignUp?.role?.attachInlinePolicy(
    new iam.Policy(this, 'preSignUpInvokeParticipantPolicy', {
      statements: [preSignUpInvokeParticipantPolicy]
    }))

    // Custom Email Sender Customer
    const customEmailSender = new lambda.Function(this, 'customEmailSenderCustomer', {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromAsset('src/functions/lambdaTriggers/customEmailSender'),
      handler: 'customEmailSender.handler',
      timeout: Duration.seconds(60),
      layers: [commonLibs],
      environment: {
        'AWS_ACCOUNT': EnvVars.AWS_ACCOUNT,
        'DEPLOYMENT_ENV': EnvVars.DEPLOYMENT_ENV,
        'SMTP_HOST': EnvVars.SMTP_HOST,
        'SMTP_PORT': EnvVars.SMTP_PORT,
        'SMTP_SECURE': EnvVars.SMTP_SECURE,
        'SMTP_USER': EnvVars.SMTP_USER,
        'SMTP_PASS': EnvVars.SMTP_PASS,
        'SMTP_FROM': EnvVars.SMTP_FROM,
        'KMS_KEY_ARN': key.keyArn,
        'KMS_KEY_ALIAS': alias.aliasName,
      }
    })


    // Create customer user pool
    const gasolaterUserPool = new cognito.UserPool(this, 'customer-userpool', {
      userPoolName: `customers-${EnvVars.DEPLOYMENT_ENV}`,
      autoVerify: {
        email: true
      },
      selfSignUpEnabled: true,
      // custom attributes
      customAttributes: {
        userCode: new cognito.StringAttribute({mutable: true}),
        role: new cognito.StringAttribute({mutable: true}),
      },
      passwordPolicy: {
        minLength: 6,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: false,
        requireSymbols: false,
      },
      signInAliases: {
        username: false,
        email: true
      },
      customSenderKmsKey: key,
      lambdaTriggers: {
        customEmailSender: customEmailSender,
        preSignUp: preSignUp
      }
    })

    gasolaterUserPool.addClient('gasolater_client', {
      refreshTokenValidity: Duration.days(30),
      accessTokenValidity: Duration.seconds(3600),
      idTokenValidity: Duration.seconds(3600),
      userPoolClientName: "Gasolater Users",
      authFlows: {
        userPassword: true
      },
      enableTokenRevocation: true,
      preventUserExistenceErrors: true
    })
    //
    // /**
    //  * Add permission for event bridge to invoke lambda function
    //  */
    // customEmailSender.addPermission('customerEmailSenderPermission', {
    //   principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
    //   action: 'lambda:InvokeFunction',
    //   sourceArn: `arn:aws:events:ap-southeast-1:${EnvVars.AWS_ACCOUNT}:*`,
    // })
    //
    // // provide permissions to describe the user pool scoped to the ARN the user pool
    // customEmailSender.role?.attachInlinePolicy(new iam.Policy(this, 'grant-kms', {
    //   statements: [new iam.PolicyStatement({
    //     effect: iam.Effect.ALLOW,
    //     actions: ['kms:CreateGrant'],
    //     resources: [key.keyArn],
    //   })],
    // }));
    //
  }
}
