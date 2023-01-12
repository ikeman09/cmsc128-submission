import {Duration, Stack, StackProps} from 'aws-cdk-lib'
import {Construct} from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as apiGateway from 'aws-cdk-lib/aws-apigateway'
import {AuthorizationType} from 'aws-cdk-lib/aws-apigateway'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as cognito from 'aws-cdk-lib/aws-cognito'
// import * as sqs from 'aws-cdk-lib/aws-sqs';

const EnvVars = require('./envConfig')

export class customerBackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // print out the Environment Variables before building
    console.table(EnvVars)

    /** --------------------
     * API Gateway
     */
    const api = new apiGateway.RestApi(this, 'gasolater', {
      restApiName: 'gasolater API Gateway',
      deployOptions: {stageName: process.env.DEPLOYMENT_ENV},
      endpointTypes: [apiGateway.EndpointType.REGIONAL],
      binaryMediaTypes: ['image/jpeg'],
      defaultCorsPreflightOptions: {
        // allowHeaders: [
        //   'Content-Type',
        //   'X-Amz-Date',
        //   'Authorization',
        //   'X-Api-Key',
        // ],
        // allowHeaders: apiGateway.Cors.DEFAULT_HEADERS.concat(['x-api-key']), // if you want to allow non-standard headers
        allowHeaders: apiGateway.Cors.DEFAULT_HEADERS,
        allowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowCredentials: true,
        // allowOrigins: [EnvVars.CORS_ALLOW_ORIGINS],
        allowOrigins: ["*"]
      },
    })

    /** --------------------
     * Amazon Cognito
     */

    // Customer User Pool
    const userPool = cognito.UserPool.fromUserPoolId(this, 'gasolaterUserPool', EnvVars.USER_POOL_ID)
    const gasolaterAuthorizer = new apiGateway.CognitoUserPoolsAuthorizer(this, 'gasolaterAPIAuthorizer', {
      cognitoUserPools: [userPool]
    })

    const stationUserPool = cognito.UserPool.fromUserPoolId(this, 'gasolaterStationUserPool', EnvVars.USER_POOL_ID_STATION)
    const gasolaterStationAuthorizer = new apiGateway.CognitoUserPoolsAuthorizer(this, 'gasolaterStationAPIAuthorizer', {
      cognitoUserPools: [stationUserPool]
    })
    /**
     * Lambda NodeJS Layer
     */
    const commonLibs = new lambda.LayerVersion(this, 'commonLibs', {
      code: lambda.Code.fromAsset('src/layers/commonLibs'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_16_X],
      description: "A layer for all nodejs lambda functions"
    })

    /**
     * Authentication Lambda Functions
     */
    const auth = new lambda.Function(this, 'auth', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'auth.handler',
      code: lambda.Code.fromAsset('src/functions/auth'),
      timeout: Duration.seconds(60),
      layers: [commonLibs],
      environment: {
        'DEPLOYMENT_ENV': EnvVars.DEPLOYMENT_ENV,
        'MONGO_USERNAME': EnvVars.MONGO_USERNAME,
        'MONGO_PASSWORD': EnvVars.MONGO_PASSWORD,
        'MONGO_CLUSTER': EnvVars.MONGO_CLUSTER,
        'USER_POOL_ID': EnvVars.USER_POOL_ID,
        'USER_POOL_WEB_CLIENT_ID': EnvVars.USER_POOL_WEB_CLIENT_ID,
        'USER_POOL_WEB_CLIENT_ID_STATION': EnvVars.USER_POOL_WEB_CLIENT_ID_STATION,
      }
    })

    const authIntegration = new apiGateway.LambdaIntegration(auth)
    const authResource = api.root.addResource('auth')

    // Sign Up Resource
    const signUpResource = authResource.addResource('signup')
    signUpResource.addMethod('POST', authIntegration)

    /**
     * STATION SIGN UP
     */
    const signUpStationResource = signUpResource.addResource('station')
    signUpStationResource.addMethod('POST', authIntegration)

    // Sign In Resource
    const signInResource = authResource.addResource('signin')
    signInResource.addMethod('POST', authIntegration)

    /**
     * STATION SIGN IN
     */
    const signInStationResource = signInResource.addResource('station')
    signInStationResource.addMethod('POST', authIntegration)

    // Refresh token Resource
    const refreshTokenResource = authResource.addResource('refresh-token')
    refreshTokenResource.addMethod('POST', authIntegration)

    const forgetPassword = authResource.addResource('forget_password')
    forgetPassword.addMethod('POST', authIntegration)

    /**
     * Customer Profile Lambda Function
     */
    const customerProfile = new lambda.Function(this, 'customerProfile', {
      functionName: `customer-${EnvVars.DEPLOYMENT_ENV}`,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'profile.handler',
      code: lambda.Code.fromAsset('src/functions/customer/profile'),
      timeout: Duration.seconds(60),
      layers: [commonLibs],
      environment: {
        'DEPLOYMENT_ENV': EnvVars.DEPLOYMENT_ENV,
        'MONGO_USERNAME': EnvVars.MONGO_USERNAME,
        'MONGO_PASSWORD': EnvVars.MONGO_PASSWORD,
        'MONGO_CLUSTER': EnvVars.MONGO_CLUSTER,
        'USER_POOL_ID': EnvVars.USER_POOL_ID,
        'USER_POOL_WEB_CLIENT_ID': EnvVars.USER_POOL_WEB_CLIENT_ID,
        'SENDGRID_API_KEY': EnvVars.SENDGRID_API_KEY,
        'SENDGRID_WELCOME_TEMPLATE_ID': EnvVars.SENDGRID_WELCOME_TEMPLATE_ID,
      }
    })

    /**
     * Note!
     *
     * POST method can only be invoked through preSignUp
     */
    const customerProfileIntegration = new apiGateway.LambdaIntegration(customerProfile)
    const customerProfileResource = api.root.addResource('customer')
    customerProfileResource.addMethod('GET', customerProfileIntegration, {
      authorizer: gasolaterAuthorizer,
      authorizationType: AuthorizationType.COGNITO
    })

    customerProfileResource.addMethod('PUT', customerProfileIntegration, {
      authorizer: gasolaterAuthorizer,
      authorizationType: AuthorizationType.COGNITO
    })

    /**
     * Station Lambda Functions
     */

    const stations = new lambda.Function(this, 'stations', {
      functionName: `station-${EnvVars.DEPLOYMENT_ENV}`,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'station.handler',
      code: lambda.Code.fromAsset('src/functions/station'),
      timeout: Duration.seconds(60),
      layers: [commonLibs],
      environment: {
        'AWS_ACCOUNT': EnvVars.AWS_ACCOUNT,
        'DEPLOYMENT_ENV': EnvVars.DEPLOYMENT_ENV,
        'MONGO_USERNAME': EnvVars.MONGO_USERNAME,
        'MONGO_PASSWORD': EnvVars.MONGO_PASSWORD,
        'MONGO_CLUSTER': EnvVars.MONGO_CLUSTER,
        'USER_POOL_ID': EnvVars.USER_POOL_ID,
        'USER_POOL_ID_STATION': EnvVars.USER_POOL_ID_STATION,
        'USER_POOL_WEB_CLIENT_ID': EnvVars.USER_POOL_WEB_CLIENT_ID,
        'USER_POOL_WEB_CLIENT_ID_STATION': EnvVars.USER_POOL_WEB_CLIENT_ID_STATION,
        'SENDGRID_WELCOME_TEMPLATE_ID': EnvVars.SENDGRID_WELCOME_TEMPLATE_ID,
        'SENDGRID_FORGOTPASSWORD_TEMPLATE_ID': EnvVars.SENDGRID_FORGOTPASSWORD_TEMPLATE_ID
      },
    })

    /**
     * Dealer Integration
     */
    const dealerIntegration = new apiGateway.LambdaIntegration(stations)
    const dealerResource = api.root.addResource('dealer')
    dealerResource.addMethod('POST', dealerIntegration)

    /**
     * Station Integration
     */
    const stationsIntegration = new apiGateway.LambdaIntegration(stations)
    const stationsResource = api.root.addResource('station')

    /**
     * Station details
     */

    // Public API (Data can be sold)
    const listStationsResource = stationsResource.addResource('all')
    listStationsResource.addMethod('GET', stationsIntegration)

    // Public API (Data can be sold)
    stationsResource.addMethod('GET', stationsIntegration)

    stationsResource.addMethod('PUT', stationsIntegration, {
      authorizer: gasolaterStationAuthorizer,
      authorizationType: AuthorizationType.COGNITO
    })

    stationsResource.addMethod('DELETE', stationsIntegration, {
      authorizer: gasolaterStationAuthorizer,
      authorizationType: AuthorizationType.COGNITO
    })

    /**
     * Station prices
     */
    const stationPricesResource = stationsResource.addResource('prices')
    stationPricesResource.addMethod('GET', stationsIntegration)

    stationPricesResource.addMethod('POST', stationsIntegration, {
      authorizer: gasolaterStationAuthorizer,
      authorizationType: AuthorizationType.COGNITO
    })

    stationPricesResource.addMethod('PUT', stationsIntegration, {
      authorizer: gasolaterStationAuthorizer,
      authorizationType: AuthorizationType.COGNITO
    })

    stationPricesResource.addMethod('DELETE', stationsIntegration, {
      authorizer: gasolaterStationAuthorizer,
      authorizationType: AuthorizationType.COGNITO
    })

    /**
     * Price updater lambda
     */
    const priceUpdater = new lambda.Function(this, 'priceUpdater', {
      functionName: `priceUpdater-${EnvVars.DEPLOYMENT_ENV}`,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'priceUpdater.handler',
      code: lambda.Code.fromAsset('src/functions/priceUpdater'),
      timeout: Duration.seconds(60),
      layers: [commonLibs],
      environment: {
        'DEPLOYMENT_ENV': EnvVars.DEPLOYMENT_ENV,
        'MONGO_USERNAME': EnvVars.MONGO_USERNAME,
        'MONGO_PASSWORD': EnvVars.MONGO_PASSWORD,
        'MONGO_CLUSTER': EnvVars.MONGO_CLUSTER,
      }
    })

    /**
     * Add permission for event bridge to invoke lambda function
     */
    priceUpdater.addPermission('priceUpdaterPermission', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:aws:events:ap-southeast-1:${EnvVars.AWS_ACCOUNT}:rule/*`,
    })

    /**
     * Locks lambda function
     */
    const locks = new lambda.Function(this, 'locks', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'locks.handler',
      code: lambda.Code.fromAsset('src/functions/customer/locks'),
      timeout: Duration.seconds(60),
      layers: [commonLibs],
      environment: {
        'AWS_ACCOUNT': EnvVars.AWS_ACCOUNT,
        'DEPLOYMENT_ENV': EnvVars.DEPLOYMENT_ENV,
        'MONGO_USERNAME': EnvVars.MONGO_USERNAME,
        'MONGO_PASSWORD': EnvVars.MONGO_PASSWORD,
        'MONGO_CLUSTER': EnvVars.MONGO_CLUSTER,
      }
    })

    /**
     * Locks
     */
    const locksIntegration = new apiGateway.LambdaIntegration(locks)

    const locksResource = api.root.addResource('lock')
    locksResource.addMethod('GET', locksIntegration)

    locksResource.addMethod('POST', locksIntegration, {
      authorizer: gasolaterAuthorizer,
      authorizationType: AuthorizationType.COGNITO
    })

    locksResource.addMethod('DELETE', locksIntegration, {
      authorizer: gasolaterAuthorizer,
      authorizationType: AuthorizationType.COGNITO
    })

    const acceptLockResource = locksResource.addResource('accept')
    acceptLockResource.addMethod('POST', locksIntegration, {
      authorizer: gasolaterStationAuthorizer,
      authorizationType: AuthorizationType.COGNITO
    })

    const cancelLockResource = locksResource.addResource('cancel')
    cancelLockResource.addMethod('POST', locksIntegration, {
      authorizer: gasolaterAuthorizer,
      authorizationType: AuthorizationType.COGNITO
    })

    /**
     *
     * Set resource policy for lambda to invoke cognito
     */
    const cognitoPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["cognito-identity:*", "cognito-idp:*", "cognito-sync:*"],
      resources: [
        `arn:aws:cognito-idp:ap-southeast-1:${EnvVars.AWS_ACCOUNT}:userpool/${EnvVars.USER_POOL_ID}`,
        `arn:aws:cognito-idp:ap-southeast-1:${EnvVars.AWS_ACCOUNT}:userpool/${EnvVars.USER_POOL_ID_STATION}`
      ],
    })

    /**
     * Set resource policy for lambda to invoke event bridge
     */

    const eventBridgePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["events:*"],
      resources: [`arn:aws:events:ap-southeast-1:${EnvVars.AWS_ACCOUNT}:*`]
    })

    // Attach role to lambda
    auth?.role?.attachInlinePolicy(
    new iam.Policy(this, 'authLambda-cognito-policy', {
      statements: [cognitoPolicy]
    }))

    // Attach role to lambda
    customerProfile?.role?.attachInlinePolicy(
    new iam.Policy(this, 'customer-cognito-policy', {
      statements: [cognitoPolicy]
    }))

    // Attach role to lambda
    stations?.role?.attachInlinePolicy(
    new iam.Policy(this, 'station-cognito-policy', {
      statements: [cognitoPolicy, eventBridgePolicy]
    }))

    // Attach role to lambda
    priceUpdater?.role?.attachInlinePolicy(
    new iam.Policy(this, 'price-updater-policy', {
      statements: [eventBridgePolicy]
    }))

    // Attach role to lambda
    locks?.role?.attachInlinePolicy(
    new iam.Policy(this, 'booking-expiry-policy', {
      statements: [eventBridgePolicy]
    }))
  }
}
