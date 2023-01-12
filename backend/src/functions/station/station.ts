export {}

const jwt_decode = require('jwt-decode')
const AWS = require('aws-sdk')
const CognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider()
const EventBridge = new AWS.EventBridge()
const {
  UserNotFound,
  MissingBodyError,
  MissingTokenError,
  MissingQueryParams,
  UnauthorizedAction,
  StationDoesNotExist,
  StationHasNoCurrentPrices,
  FuelTypeAlreadyExists,
  RuleNameDoesNotExist,
  DealerAlreadyExists,
  InvalidHttpMethod,
  UserAlreadyHaveALock,
  errorHandler
} = require('/opt/returns/errorHandler')
const {responseTypes, gatewayResponse} = require('/opt/returns/successMessages')
const connectToDatabase = require('/opt/database/mongoDatabase')
const User = require('/opt/database/models/userSchema')
const Station = require('/opt/database/models/stationSchema')
const Dealer = require('/opt/database/models/dealerSchema')
const dateToCron = require('/opt/helpers/dateToCron')
const ShortUniqueId = require('short-unique-id')

exports.handler = async (event: any) => {
  try {
    const body = JSON.parse(event.body)
    if(event.resource == '/station') {
      switch (event.httpMethod) {
        case 'GET': {
          return await getStation(event)
        }
        case 'POST': {
          return await createStation(body)
        }
        case 'PUT': {
          return await updateStation(event)
        }
        case 'DELETE': {
          return await deleteStation(event)
        }
        default: {
          throw new InvalidHttpMethod(event.httpMethod)
        }
      }
    }

    if(event.resource == '/station/prices') {
      switch (event.httpMethod) {
        case 'GET': {
          return await getPrices(event)
        }
        case 'POST': {
          return await createPrice(event)
        }
        case 'PUT': {
          return await updatePrice(event)
        }
        case 'DELETE': {
          return await deletePrice(event)
        }
        default: {
          throw new InvalidHttpMethod(event.httpMethod)
        }
      }
    }

    if(event.resource == '/station/all')
      return await listStations(event)

    if(event.resource == '/dealer')
      return await createDealer(body)


  } catch (error) {
    return errorHandler(error)
  }
}


export const getStation = async (event: any) => {
  /**
   * Allowed roles: customer, dealer, station
   */
  try {
    // Check if jwt exists
    if(!event.headers.Authorization)
      throw new MissingTokenError()

    // Decode jwt
    const decodedToken = jwt_decode(event.headers.Authorization)

    // Get role
    const role = decodedToken["custom:role"]

    switch (role) {
      case 'employee': {
        // Get station ID
        const stationID = decodedToken['custom:stationID']

        // Connect to database
        await connectToDatabase()

        // Find station
        const station = await Station.findOne({station_id: stationID})

        return gatewayResponse(responseTypes.FETCH, station)
      }
      case 'customer': {
        // Check event parameters if keyword is present
        const stationID = event.queryStringParameters?.station_id ?? undefined

        // Check if station ID exists
        if(!stationID)
          throw new MissingQueryParams('station_id')

        // Connect to database
        await connectToDatabase()

        const customerID = decodedToken['custom:userCode']

        const station = await Station.findOne({station_id: stationID})

        if(!station)
          return gatewayResponse(responseTypes.FETCH, station)

        // TODO: BLUNDER PLEASE CHANGE placeholder for the mean time
        const customer = await User.findOne({customer_id: customerID})

        const bookings = customer.bookings

        const findBooking = bookings.find((element: any) => element.station_name == station.name)

        if(findBooking)
          throw new UserAlreadyHaveALock()

        return gatewayResponse(responseTypes.FETCH, station)
      }
      default: {
        // Check event parameters if keyword is present
        const stationID = event.queryStringParameters?.station_id ?? undefined

        // Check if station ID exists
        if(!stationID)
          throw new MissingQueryParams('station_id')

        // Connect to database
        await connectToDatabase()

        const station = await Station.findOne({station_id: stationID})

        return gatewayResponse(responseTypes.FETCH, station)
      }
    }
  } catch (error) {
    return errorHandler(error)
  }
}

export const listStations = async (event: any) => {
  /**
   * Allowed roles: agnostic
   */
  try {
    // Check event parameters if keyword is present
    const keyword = event.queryStringParameters?.keyword ?? undefined

    // Connect to database
    await connectToDatabase()

    if(keyword) {
      // Regex query
      const stations = await Station.find({name: {$regex: keyword, $options: "i"}})

      // Return all entries with the keyword
      return gatewayResponse(responseTypes.FETCH, stations)
    }

    // Check if fuel_type is present
    const fuelType = event.queryStringParameters?.fuel_type ?? undefined

    if(fuelType) {
      // Connect to database
      await connectToDatabase()

      // Find station with fuel types
      const stations = await Station.find({'current_prices.fuel_type': fuelType})

      // Return current prices of station
      return gatewayResponse(responseTypes.FETCH, stations)
    }

    // Get all stations
    const stations = await Station.find({})

    // Stations to be pushed
    const listStations = []

    // Iterate all stations (todo: seems heavy)
    for (const station of stations) {
      if(station.current_prices.length)
        listStations.push(station)
    }

    return gatewayResponse(responseTypes.FETCH, listStations)
  } catch (error) {
    errorHandler(error)
  }
}

export const createStation = async (body: any) => {
  /**
   * Allowed roles: customer, dealer, station
   */
  try {
    // Destructure body
    const {name, email, address, contactNumber, stationID, stationCode, latitude, longitude} = body

    // Connect to database
    await connectToDatabase()

    // Find station
    const station = await Station.findOne({station_id: stationID})

    // Update value if stationID exists for idempotence
    if(station) {
      station.name = name
      station.address = address
      station.contact_number = contactNumber
      station.longitude = longitude
      station.latitude = latitude
    }

    // Create new station
    const newStation = new Station({
      station_id: stationID,
      dealer_email: email,
      station_code: stationCode,
      name: name,
      contact_number: contactNumber,
      address: address,
      coordinates: {
        longitude: longitude,
        latitude: latitude
      },
      status: 'active'
    })

    // Save new station
    await newStation.save()

    // todo: Send welcome email station
    // TODO: IMPORTANT!! ALSO SEND THE STATION_CODE IN THE EMAIL

    return gatewayResponse(responseTypes.SAVE)
  } catch (error) {
    return errorHandler(error)
  }
}

export const updateStation = async (event: any) => {
  /**
   * Allowed roles: dealer
   */
  try {
    const body = JSON.parse(event.body)

    // Decode jwt
    const decodedToken = jwt_decode(event.headers.Authorization)

    // Get role
    const role = decodedToken["custom:role"]

    // Check role if dealer, if not throw unauthorized action
    if(role != 'dealer')
      throw new UnauthorizedAction()

    const {name, address, contact_number, latitude, longitude, station_id, status} = body

    // Throw error if station_id is undefined
    if(!station_id)
      throw new MissingBodyError(station_id)

    // Connect to database
    await connectToDatabase()

    // Search for station
    const station = await Station.findOne({station_id: station_id})

    // Check if station exists, throw error if null
    if(!station)
      throw new StationDoesNotExist()

    // Update values in mongo
    station.name = name ?? station.name
    station.address = address ?? station.address
    station.contact_number = contact_number ?? station.contact_number
    station.coordinates.longitude = longitude ?? station.coordinates.longitude
    station.coordinates.latitude = latitude ?? station.coordinates.latitude
    station.status = status ?? station.status

    // -- Update cognito

    // Cognito parameters
    const parameters = {
      UserAttributes: [
        {
          Name: 'name',
          Value: name ?? station.name,
        },
        {
          Name: 'address',
          Value: address ?? station.address,
        },
        {
          Name: 'custom:contactNumber',
          Value: contact_number ?? station.contact_number
        },
        {
          Name: 'custom:longitude',
          Value: longitude ?? station.coordinates.longitude
        },
        {
          Name: 'custom:latitude',
          Value: latitude ?? station.coordinates.latitude
        },
      ],
      UserPoolId: process.env.USER_POOL_ID_STATION,
      Username: station.station_code,
      ClientMetadata: {}
    }

    // Call cognito
    await CognitoIdentityServiceProvider.adminUpdateUserAttributes(parameters).promise()

    // Save updated station
    const updatedStation = await station.save()

    return gatewayResponse(responseTypes.SAVE, updatedStation)
  } catch (error) {
    return errorHandler(error)
  }
}

export const deleteStation = async (event: any) => {
  /**
   * Allowed roles: dealer
   */
  try {
    // Decode token
    const decodedToken = jwt_decode(event.headers.Authorization)

    // Get role
    const role = decodedToken['custom:role']

    // Check if role is dealer
    if (role != 'dealer')
      throw new UnauthorizedAction()

    // Check event parameters if station_code is present
    const stationCode = event.queryStringParameters?.station_code ?? undefined

    // -- Delete user in cognito

    // Cognito parameters
    const parameters = {
      UserPoolId: process.env.USER_POOL_ID_STATION,
      Username: stationCode
    }

    // Call cognito
    await CognitoIdentityServiceProvider.adminDeleteUser(parameters).promise()

    // Connect to database
    await connectToDatabase()

    // Delete user in mongo (station)
    const deletedStation = await Station.deleteOne({station_code: stationCode})

    // -- Delete user in mongo (dealer)

    // Get email
    const email = decodedToken.email

    // Find dealer
    const dealer = await Dealer.findOne({email: email})

    // Check if dealer exists
    if (!dealer)
      throw new UserNotFound()

    // -- Delete station_id from array

    // Get index
    const index = dealer.station_ids.indexOf(deletedStation.station_id)

    // Splice station_id
    dealer.station_ids.splice(index, 1)

    // Save to database
    await dealer.save()

    return gatewayResponse(responseTypes.DELETE, {deleted_station: deletedStation})
  } catch (error) {
    return errorHandler(error)
  }
}

export const createDealer = async (body: any) => {
  /**
   * Allowed roles: agnostic
   */
  try {
    // Destructure body
    const {name, email} = body

    // Connect to database
    await connectToDatabase()

    // -- Find if dealer exists, throw error
    const dealer = await Dealer.findOne({email: email})

    if(dealer)
      throw new DealerAlreadyExists()

    // Supply dealer_id
    let dealerID = new ShortUniqueId({length: 8, dictionary: "alphanum_lower"})();
    dealerID = dealerID + name.charAt(0) + name.charAt(name.indexOf('@') - 1)

    // Create new dealer
    const newDealer = new Dealer({
      dealer_id: dealerID,
      name: name,
      email: email
    })

    // Save new dealer
    await newDealer.save()

    return gatewayResponse(responseTypes.SAVE, newDealer)
  } catch (error) {
    return errorHandler(error)
  }
}


/**
 * Prices API
 */

/**
 * Get prices
 */
export const getPrices = async (event: any) => {
  /**
   * Allowed roles: customer, station, dealer
   */
  try {
    // Get station ID
    const stationID = event.queryStringParameters?.station_id

    // Check if station ID exists
    if(!stationID)
      throw new MissingQueryParams()

    // Connect to database
    await connectToDatabase()

    // Find station
    const station = await Station.findOne({station_id: stationID})

    // Check if current prices is not null
    if(!station.current_prices.length)
      throw new StationHasNoCurrentPrices()

    // Return current prices of station
    return gatewayResponse(responseTypes.FETCH, station.current_prices)
  } catch (error) {
    return errorHandler(error)
  }
}

export const createPrice = async (event: any) => {
  /**
   * Allowed roles: dealer, station
   */
  try {
    // Decode token
    const decodedToken = jwt_decode(event.headers.Authorization)

    // Get role
    const role = decodedToken["custom:role"]

    // Check role if authorized
    if(role === 'customer')
      throw new UnauthorizedAction()

    // Get body parameters (station_id only present if dealer)
    const {fuel_type, price, effectivity_date, station_id} = JSON.parse(event.body)

    // Get station ID depending on the role
    let stationID

    if(role === 'employee') {
      // Get station_id
      stationID = decodedToken['custom:stationID']
    } else {
      if(station_id)
        throw new MissingQueryParams('station_id')

      stationID = station_id
    }

    // Connect to database
    await connectToDatabase()

    // Get user
    const station = await Station.findOne({station_id: stationID})

    // Check if station exists
    if (!station)
      throw new StationDoesNotExist()

    // Update price_schedules
    const currentPriceSchedules = station.price_schedules

    // Find element in array and check if fuel type already exists
    const foundPrice = currentPriceSchedules.find((element: any) => element.fuel_type == fuel_type.toLowerCase())

    // Throw error if price exists
    if(foundPrice)
      // TODO: should not throw error this should be allowed
      throw new FuelTypeAlreadyExists()

    /**
     * Create event bridge rule to invoke lambda
     */

    // Convert ISO to javascript date
    const newDate = new Date(effectivity_date)

    // Convert javascript date to cron date
    const cronDate = dateToCron(newDate)

    console.log(cronDate)

    // Add a unique identifier to the name
    const uniqueIdentifier = new ShortUniqueId({length: 8, dictionary: "alphanum_lower"})()

    // Event bridge rule parameters
    const ruleParameters = {
      Name: `price-updater-${uniqueIdentifier}`,
      Description: 'An event bridge rule that updates a station fuel price',
      ScheduleExpression: `cron(${cronDate})`,
      State: 'ENABLED',
    }

    // Call event bridge
    const eventRule = await EventBridge.putRule(ruleParameters).promise()

    console.log(eventRule)

    /**
     * NOTE!!! cannot create target before rule
     */
    // -- Add an event target

    // Supply event JSON
    const payload = {
      "fuel_type": fuel_type.toLowerCase(),
      "price": price,
      "station_id": stationID,
      "effectivity_date": effectivity_date,
      "target_id": uniqueIdentifier,
      "type": "CREATE_PRICE"
    }

    // Event bridge target parameters
    const targetParameters = {
      Rule: `price-updater-${uniqueIdentifier}`,
      Targets: [{
        Arn: `arn:aws:lambda:ap-southeast-1:${process.env.AWS_ACCOUNT}:function:priceUpdater-${process.env.DEPLOYMENT_ENV}`,
        Id: uniqueIdentifier,
        Input: JSON.stringify(payload),
      }]
    }

    // Call event bridge
    const eventTarget = await EventBridge.putTargets(targetParameters).promise()

    console.log(eventTarget)

    // Supply parameters to be pushed
    const newPrice = {
      fuel_type: fuel_type.toLowerCase(),
      price: price,
      effectivity_date: effectivity_date,
      event_id: `price-updater-${uniqueIdentifier}` // todo eventbridge
    }

    // Push to mongodb
    station.price_schedules.push(newPrice)

    // Save to database
    await station.save()

    return gatewayResponse(responseTypes.SAVE, station)
  } catch (error) {
    return errorHandler(error)
  }
}

export const updatePrice = async (event: any) => {
  try {
    /**
     * Allowed roles: dealer, station
     */

    // Decode token
    const decodedToken = jwt_decode(event.headers.Authorization)

    // Get role
    const role = decodedToken["custom:role"]

    // Check role if authorized
    if(role === 'customer')
      throw new UnauthorizedAction()

    // Get body parameters (station_id only present if dealer)
    const {fuel_type, price, effectivity_date, station_id, rule_name} = JSON.parse(event.body)

    // Get station ID depending on the role
    let stationID

    if(role === 'employee') {
      // Get station_id
      stationID = decodedToken['custom:stationID']
    } else {
      if(!station_id)
        throw new MissingBodyError('station_id')

      stationID = station_id
    }

    // Connect to database
    await connectToDatabase()

    // Get user
    const station = await Station.findOne({station_id: stationID})

    // Check if station exists
    if (!station)
      throw new StationDoesNotExist()

    // Update price_schedules
    const priceSchedules = station.price_schedules

    // Find element in array and check if event_id already exists
    const foundPrice = priceSchedules.find((element: any) => element.event_id == rule_name)

    // Throw error if price does not exist
    if(!foundPrice)
      throw new RuleNameDoesNotExist()

    // Get index of element
    const index = priceSchedules.indexOf(foundPrice)

    // Delete scheduled price
    priceSchedules.splice(index,1)

    // Set parameters to be pushed
    const parameters = {
      fuel_type: fuel_type,
      price: price,
      effectivity_date: effectivity_date,
      event_id: rule_name
    }

    // Push parameters
    priceSchedules.push(parameters)

    // New price_schedules
    station.price_schedules = priceSchedules

    // -- Edit event bridge

    // Convert ISO to javascript date
    const newDate = new Date(effectivity_date)

    // Convert javascript date to cron date
    const cronDate = dateToCron(newDate)

    console.log(cronDate)

    // Event bridge rule parameters
    const ruleParameters = {
      Name: rule_name,
      Description: 'An event bridge rule that updates a station fuel price',
      ScheduleExpression: `cron(${cronDate})`,
      State: 'ENABLED',
    }

    // Call event bridge
    const eventRule = await EventBridge.putRule(ruleParameters).promise()

    console.log(eventRule)

    // -- Add an event target

    // -- Apply string manipulation for unique identifier
    const uniqueIdentifier = rule_name.substr(14)

    // Supply event JSON
    const payload = {
      "fuel_type": fuel_type.toLowerCase(),
      "price": price,
      "station_id": stationID,
      "effectivity_date": effectivity_date,
      "target_id": uniqueIdentifier,
      "type": "CREATE_PRICE"
    }

    // Event bridge target parameters
    const targetParameters = {
      Rule: rule_name,
      Targets: [{
        Arn: `arn:aws:lambda:ap-southeast-1:${process.env.AWS_ACCOUNT}:function:priceUpdater-${process.env.DEPLOYMENT_ENV}`,
        Id: uniqueIdentifier,
        Input: JSON.stringify(payload),
      }]
    }

    // Call event bridge
    const eventTarget = await EventBridge.putTargets(targetParameters).promise()

    console.log(eventTarget)

    // Save to database
    await station.save()

    return gatewayResponse(responseTypes.SAVE, station)
  } catch (error) {
    return errorHandler(error)
  }
}

export const deletePrice = async (event: any) => {
  try {
    /**
     * Allowed roles: dealer, station
     */

    // Decode token
    const decodedToken = jwt_decode(event.headers.Authorization)

    // Get role
    const role = decodedToken["custom:role"]

    // Check role if authorized
    if(role === 'customer')
      throw new UnauthorizedAction()

    const station_id = event.queryStringParameters?.station_id
    const rule_name = event.queryStringParameters?.rule_name

    // Throw error if rule_name does not exist
    if(!rule_name)
      throw new MissingQueryParams('rule_name')

    // Get station ID depending on the role
    let stationID

    if(role === 'employee') {
      // Get station_id
      stationID = decodedToken['custom:stationID']
    } else {
      if(!station_id)
        throw new MissingQueryParams('station_id')

      stationID = station_id
    }

    // Connect to database
    await connectToDatabase()

    // Get user
    const station = await Station.findOne({station_id: stationID})

    // Check if station exists
    if (!station)
      throw new StationDoesNotExist()

    // Update price_schedules
    const priceSchedules = station.price_schedules

    // Find element in array and check if event_id already exists
    const foundPrice = priceSchedules.find((element: any) => element.event_id == rule_name)

    // Throw error if price does not exist
    if(!foundPrice)
      throw new RuleNameDoesNotExist()

    // Get index of element
    const index = priceSchedules.indexOf(foundPrice)

    // Delete scheduled price
    priceSchedules.splice(index,1)

    // New price_schedules
    station.price_schedules = priceSchedules

    // -- Apply string manipulation for unique identifier
    const uniqueIdentifier = rule_name.substr(14)

    // -- Remove target

    // Remove target parameters
    const removeTargetParameters = {
      Ids: [uniqueIdentifier],
      Rule: rule_name,
      Force: true
    }

    // Call event bridge
    const removeTarget = await EventBridge.removeTargets(removeTargetParameters).promise()

    console.log(removeTarget)

    // -- Delete rule from event bridge

    // Delete rule parameters
    const deleteRuleParameters = {
      Name: rule_name,
      Force: true
    }

    // Call event bridge
    const deleteRule = await EventBridge.deleteRule(deleteRuleParameters).promise()

    console.log(deleteRule)

    // Save database
    await station.save()

    return gatewayResponse(responseTypes.DELETE, station)
  } catch (error) {
    return errorHandler(error)
  }
}
