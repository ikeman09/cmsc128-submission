const AWS = require('aws-sdk')
const lambda = new AWS.Lambda()
const {GenericError} = require('/opt/returns/errorHandler')

const headers = {
  "accept": "application/json, text/plain, */*",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
  // "content-type": "application/json", NOTE: content-type breaks lambda (will not hit endpoint)
}

//TODO: create for organizer (JAN 4, 2023 VERDICT: need to transfer to another handler)
exports.handler = async (event: any) => {
  try {
    console.log(event.request.userAttributes['custom:role'])
    switch(event.request.userAttributes['custom:role']) {
      case 'dealer': {
        return await stationPreSignUpDealer(event)
      }
      case 'employee': {
        return await stationPreSignUpEmployee(event)
      }
    }
  } catch (error) {
    return error
  }
}


export const stationPreSignUpDealer = async (event: any) => {
  try {
    // Auto Confirm participant - needed for auto-login after signup functionality, otherwise JWT will not be returned
    event.response.autoConfirmUser = true;
    // Auto Verify participant's email - needed so forget password will work
    event.response.autoVerifyEmail = true;

    // TODO: since dealer has no values in cognito, authorization should check mongo instead

    return event
  } catch (error) {
    return error
  }
}

export const stationPreSignUpEmployee = async (event: any) => {
  try {
    // Auto Confirm participant - needed for auto-login after signup functionality, otherwise JWT will not be returned
    event.response.autoConfirmUser = true;
    // Auto Verify participant's email - needed so forget password will work
    // event.response.autoVerifyEmail = true;

    let body = {
      "userId": event.userName, //do not use sub
      "stationID": event.request.userAttributes['custom:stationID'],
      "stationCode": event.request.userAttributes['custom:stationCode'],
      "contactNumber": event.request.userAttributes['custom:contactNumber'],
      "longitude": event.request.userAttributes['custom:longitude'],
      "latitude": event.request.userAttributes['custom:latitude'],
      "name": event.request.userAttributes.name,
      "email": event.request.userAttributes.email,
      "address": event.request.userAttributes.address,
      "password": event.request.clientMetadata?.pass,
    }

    let payload = {
      'resource': '/station',
      'httpMethod': 'POST',
      'headers': headers,
      'body': JSON.stringify(body),
      "queryStringParameters": null,
      "multiValueQueryStringParameters": null,
      "stageVariables": null,
      "isBase64Encoded": 'false'
    }

    // call customer profile function
    const params = {
      FunctionName: `station-${process.env.DEPLOYMENT_ENV}`,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload)
    }

    const result = await lambda.invoke(params).promise()

    // Catch error
    const resultPayload = JSON.parse(result.Payload)
    if (resultPayload.statusCode !== 201) {
      throw new GenericError(resultPayload.body)
    }

    // TODO: IMPORTANT!! LOG PASSWORD FOR NOW
    console.log(event.request.clientMetadata?.pass)

    return event
  } catch (error) {
    return error
  }
}

