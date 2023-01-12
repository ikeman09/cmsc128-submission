export {}

const jwt_decode = require('jwt-decode')
const {MissingTokenError,InvalidHttpMethod, UserNotFound, errorHandler} = require('/opt/returns/errorHandler')
const {responseTypes, gatewayResponse} = require('/opt/returns/successMessages')
const connectToDatabase = require('/opt/database/mongoDatabase')
const User = require('/opt/database/models/userSchema')
const AWS = require('aws-sdk')
const CognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider()
const sgMail = require('@sendgrid/mail')

exports.handler = async (event: any) => {
  try {
    switch (event.httpMethod) {
      case 'GET': {
        return await getCustomer(event)
      }
      case 'POST': {
        console.log('HELLO I WAS INVOKED')
        // return gatewayResponse(responseTypes.SAVE)
        return await createCustomer(event)
      }
      case 'PUT': {
        return await updateCustomer(event)
      }
      default: {
        throw new InvalidHttpMethod(event.httpMethod)
      }
    }
  } catch (error) {
    return errorHandler(error)
  }
}

/**
 * Note!!
 * createCustomer should only be called by preSignUp
 */
const createCustomer = async (event: any) => {
  try {
    // Get body
    const body = JSON.parse(event.body)

    const subject = 'Welcome to Gasolater'


    const emailConfig = {
      personalizations: [
        {
          to: body.email,
          subject: subject,
          dynamic_template_data: {
            name: body.name,
          }
        }
      ],
      template_id: process.env.SENDGRID_WELCOME_TEMPLATE_ID,
      from: {
        email: "contact@gasolater.ph",
        name: "Gasolater"
      }
    }


    // todo: send email from sendgrid to client

    // Connect to database
    await connectToDatabase()

    // Find customer
    const customer = await User.findOne({email: body.email})

    if(customer) {
      // throw new UserAlreadyRegisteredError(body.email)
      // function can be invoked twice (Idempotent lambda)
      // so instead of throwing an error, just exit the function if user already exist in mongo

      customer.customer_id = body.userCode
      customer.email = body.email
      customer.name = body.name

      // todo: Send welcome email
      await customer.save()


      sgMail.setApiKey(process.env.SENDGRID_API_KEY)
      await sgMail.send(emailConfig)

      return gatewayResponse(responseTypes.SAVE)
    }

    const newCustomer = new User({
      customer_id: body.userCode,
      role: body.role,
      email: body.email,
      name: body.name,
    })

    await newCustomer.save()

    sgMail.setApiKey(process.env.SENDGRID_API_KEY)
    await sgMail.send(emailConfig)
    // todo: Send welcome email

    return gatewayResponse(responseTypes.SAVE)
  } catch (error) {
    return errorHandler(error)
  }
}

const getCustomer = async (event: any) => {
  try {
    // Get Authorization
    const jwt = event.headers?.Authorization

    if(!jwt)
      throw new MissingTokenError()

    // Get customer
    const decodedToken = jwt_decode(jwt)
    const customerId = decodedToken['custom:userCode']

    // Connect to Database
    await connectToDatabase()

    // Find customer
    let customer = await User.findOne({customer_id: customerId})

    // Check if customer does not exist
    if(!customer)
      throw new UserNotFound()

    return gatewayResponse(responseTypes.FETCH, customer)
  } catch (error) {
    return errorHandler(error)
  }
}

/**
 * body fields available
 * - plate_numbers
 * - email
 * - name
 */
const updateCustomer = async (event: any) => {
  try {
    // Get Authorization
    const jwt = event.headers?.Authorization

    // Check if JWT exists
    if(!jwt)
      throw new MissingTokenError()

    // Get customer
    const decodedToken = jwt_decode(jwt)
    const customerId = decodedToken['custom:userCode']

    // Get body
    const body = JSON.parse(event.body)

    // Connect to database
    await connectToDatabase()

    // Get customer
    const customer = await User.findOne({customer_id: customerId})

    // Throw error if customer does not exist
    if(!customer)
      throw new UserNotFound()

    // Update all fields user wishes to updated as seen in event.body
    customer.plate_numbers = body?.plate_numbers ?? customer.plate_numbers
    customer.email = body?.email ?? customer.email
    customer.name = body?.name ?? customer.name

    // Update in cognito
    if(body.email || body.name) {

      // Cognito parameters
      const parameters = {
        UserAttributes: [
          {
            Name: 'email',
            Value: body.email ?? decodedToken.email,
          },
          {
            Name: 'email_verified',
            Value: 'true'
          },
          {
            Name: 'name',
            Value: body.name ?? decodedToken.name
          }
        ],
        UserPoolId: process.env.USER_POOL_ID,
        Username: decodedToken.email,
        ClientMetadata: {}
      }

      await CognitoIdentityServiceProvider.adminUpdateUserAttributes(parameters).promise()
    }

    // Update in database
    const updatedCustomer = await customer.save()

    return gatewayResponse(responseTypes.SAVE, updatedCustomer)
  } catch (error){
    return errorHandler(error)
  }
}
