import * as process from "process";

const {DealerNotFound, errorHandler} = require('/opt/returns/errorHandler')
const {responseTypes, gatewayResponse} = require('/opt/returns/successMessages')
const connectToDatabase = require('/opt/database/mongoDatabase')
const Dealer = require('/opt/database/models/dealerSchema')
const AWS = require('aws-sdk')
const ShortUniqueId = require('short-unique-id')
const CognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider()


/**
 * Note to Devs!!
 * The reason why we put this in the backend so that we would refrain TCP/IP
 * protocols being sent from frontend to backend (AWS).
 * This is to avoid passing sensitive information from client to server.
 * This way, we are able to pass sensitive information within the AWS environment
 */
exports.handler = async (event: any) => {
  try {
    switch (event.resource) {
      case '/auth/signup': {
        const {email, name, password} = JSON.parse(event.body)
        return await signup(email, name, password)
      }
      case '/auth/signup/station': {
        const {dealer_id, password, name, contact_number, address, longitude, latitude} = JSON.parse(event.body)
        return await signupStation(dealer_id, password, name, contact_number, address, longitude, latitude)
      }
      case '/auth/signin': {
        const {email, password} = JSON.parse(event.body)
        return await signin(email, password)
      }
      case '/auth/signin/station': {
        const {username, password} = JSON.parse(event.body)
        return await signinStation(username, password)
      }
      case '/auth/refresh-token': {
        const {refresh_token} = JSON.parse(event.body)
        return await refreshtoken(refresh_token)
      }
      case '/auth/forget_password': {
        const {email} = JSON.parse(event.body)
        return await forgetPassword(email)
      }
    }
  } catch (error) {
   return errorHandler(error)
  }
}

// TODO: create signUp for organizer
export const signup = async (email: string, name: string, password: string) => {
  try {

    // Supply userCode
    let userCode = new ShortUniqueId({length: 8, dictionary: "alphanum_lower"})();
    userCode = userCode + email.charAt(0) + email.charAt(email.indexOf('@') - 1)

    // Documentation: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CognitoIdentityServiceProvider.html#signUp-property
    // Sign up parameters
    const parameters = {
      ClientId: process.env.USER_POOL_WEB_CLIENT_ID,
      Password: password,
      Username: email,
      UserAttributes: [
        {
          Name: 'custom:role',
          Value: 'customer'
        },
        {
          Name: 'custom:userCode',
          Value: userCode
        },
        {
          Name: 'name',
          Value: name
        }
      ]
    }

    const signUpResult = await CognitoIdentityServiceProvider.signUp(parameters).promise()

    return gatewayResponse(responseTypes.SAVE, signUpResult)
  } catch (error) {
    return errorHandler(error)
  }
}

/**
 *
 * @param dealer_id
 * @param password
 * @param name
 * @param contact_number
 * @param address
 * @param longitude
 * @param latitude
 */

// todo: AMAZON COGNITO USER POOL FOR STATIONS
// todo: create dealer api
export const signupStation = async (dealer_id: string,
                                    password: string,
                                    name: string,
                                    contact_number: string,
                                    address: string,
                                    longitude: string,
                                    latitude: string) => {
  try {
    // Connect to database
    await connectToDatabase()

    // Check if dealer exists
    const dealer = await Dealer.findOne({dealer_id: dealer_id})

    // Check if dealer exists
    if(!dealer)
      throw new DealerNotFound()

    // Supply station id
    let stationId = new ShortUniqueId({length: 8, dictionary: "alphanum_lower"})();

    // Supply station code FOR SIGNING UP TO STATION
    let stationCode = new ShortUniqueId({length: 8, dictionary: "alphanum_lower"})();
    stationCode = stationCode + name.charAt(0) + name.charAt(name.indexOf('@') - 1)

    /**
     * IMPORTANT NOTE!!
     *
     * We are going to create two entries in amazon cognito.
     * 1 for dealer
     * and another 1 for employee
     *
     * username password will be random generated for employee
     * username password will be provided by the dealer
     *
     * Problem: Dealer will have multiple accounts!
     * Solution: try catch in line 188 will solve this; code will only console.log the error
     */

    /**
     * Parameters for DEALER
     *
     * username can be email OR is dealer mongo id
     * password is provided
     */
    const parametersDealer = {
      ClientId: process.env.USER_POOL_WEB_CLIENT_ID_STATION,
      Password: password,
      Username: dealer.id,
      UserAttributes: [
        {
          Name: 'custom:role',
          Value: 'dealer'
        },
        {
          Name: 'email',
          Value: dealer.email
        },
      ]
    }

    // Call cognito
    let signUpResultDealer

    try {
      signUpResultDealer = await CognitoIdentityServiceProvider.signUp(parametersDealer).promise()
    } catch (error) {
      console.log(error)
    }

    // Supply password for employee
    let employeePassword = new ShortUniqueId({length: 8, dictionary: "alphanum_lower"})();

    /**
     * Parameters for EMPLOYEE
     *
     * username is randomly generated stationCode
     * password is randomly generated to be logged for now in preSignUpStation
     */
    const parametersEmployee = {
      ClientId: process.env.USER_POOL_WEB_CLIENT_ID_STATION,
      Password: employeePassword,
      Username: stationCode,
      ClientMetadata: {
        pass: employeePassword
      },
      UserAttributes: [
        {
          Name: 'custom:contactNumber',
          Value: contact_number
        },
        {
          Name: 'custom:stationCode',
          Value: stationCode
        },
        {
          Name: 'custom:stationID',
          Value: stationId
        },
        {
          Name: 'custom:longitude',
          Value: longitude
        },
        {
          Name: 'custom:latitude',
          Value: latitude
        },
        {
          Name: 'custom:role',
          Value: 'employee'
        },
        {
          Name: 'name',
          Value: name
        },
        {
          Name: 'email',
          Value: dealer.email
        },
        {
          Name: 'address',
          Value: address
        }
      ]
    }

    // Call cognito
    const signUpResultEmployee = await CognitoIdentityServiceProvider.signUp(parametersEmployee).promise()

    // Push new station ID
    dealer.station_ids.push(stationId)

    // Save to database
    await dealer.save()

    return gatewayResponse(responseTypes.SAVE, {dealer: signUpResultDealer, employee: signUpResultEmployee})
  } catch (error) {
    return errorHandler(error)
  }
}

export const signin = async (email: string, password: string) => {
  try {

    // Sign in parameters
    const parameters = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: process.env.USER_POOL_WEB_CLIENT_ID, /* required */
      AuthParameters: {
        "USERNAME": email,
        "PASSWORD": password
      },
      ClientMetadata: {},
    }

    const signIn = await CognitoIdentityServiceProvider.initiateAuth(parameters).promise()

    return gatewayResponse(responseTypes.FETCH, signIn)
  } catch (error) {
    return errorHandler(error)
  }
}

export const signinStation = async (username: string, password: string) => {
  try {

    // Sign in parameters
    const parameters = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: process.env.USER_POOL_WEB_CLIENT_ID_STATION, /* required */
      AuthParameters: {
        "USERNAME": username,
        "PASSWORD": password
      },
      ClientMetadata: {},
    }

    const signIn = await CognitoIdentityServiceProvider.initiateAuth(parameters).promise()

    return gatewayResponse(responseTypes.FETCH, signIn)
  } catch (error) {
    return errorHandler(error)
  }
}

export const refreshtoken = async (refresh_token: string) => {
  try {

    // Refresh token parameters
    const parameters = {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: process.env.USER_POOL_WEB_CLIENT_ID, /* required */
      AuthParameters: {
        'REFRESH_TOKEN': refresh_token
      },
      ClientMetadata: {},
    }

    const refreshToken = await CognitoIdentityServiceProvider.initiateAuth(parameters).promise()

    return gatewayResponse(responseTypes.FETCH, refreshToken)
  } catch (error) {
    return errorHandler(error)
  }
}

export const forgetPassword = async (email: string) => {
  try {
    // forget password parameters

    const params = {
      ClientId: process.env.USER_POOL_WEB_CLIENT_ID, /* required */
      Username: email, /* required */
    }

    const forgetPassword = await CognitoIdentityServiceProvider.forgotPassword(params).promise()

    return gatewayResponse(responseTypes.FETCH, forgetPassword)
  } catch (error) {
    return errorHandler(error)
  }
}
