export {}

const jwt_decode = require('jwt-decode')
const AWS = require('aws-sdk')
const EventBridge = new AWS.EventBridge()
const connectToDatabase = require('/opt/database/mongoDatabase')
const Station = require('/opt/database/models/stationSchema')
const User = require('/opt/database/models/userSchema')
const Booking = require('/opt/database/models/bookingSchema')
const {responseTypes, gatewayResponse} = require('/opt/returns/successMessages')
const {
  MissingQueryParams,
  MissingTokenError,
  LockDoesNotExist,
  LockIsStillOpen,
  LockCannotBeClaimed,
  UnauthorizedAction,
  errorHandler
} = require('/opt/returns/errorHandler')
const dateToCron = require('/opt/helpers/dateToCron')
const ShortUniqueId = require('short-unique-id')

exports.handler = async (event: any) => {
  try {
    switch (event.resource) {
      case '/lock': {
        switch(event.httpMethod) {
          case 'GET': {
            return await getLock(event)
          }
          case 'POST': {
            return await createLock(event)
          }
          case 'DELETE': {
            return await deleteLock(event)
          }
        }
      }
      case '/lock/accept': {
        return await acceptLock(event)
      }
      case '/lock/cancel': {
        return await cancelLock(event)
      }
    }
  } catch (error) {
    return errorHandler(error)
  }
}

export const getLock = async (event: any) => {
  /**
   * Allowed roles: dealer, station, customer
   */
  try {
    // Check if jwt is present
    if(!event.headers.Authorization)
      throw new MissingTokenError()

    // Get query parameters
    const bookingID = event.queryStringParameters?.booking_id

    // Check if booking ID is undefined
    if(!bookingID)
      throw new MissingQueryParams('booking_id')

    // Connect to database
    await connectToDatabase()

    // Get booking
    const booking = await Booking.findOne({booking_id: bookingID})

    if(!booking)
      throw new LockDoesNotExist()

    return gatewayResponse(responseTypes.FETCH, booking)
  } catch (error) {
    return errorHandler(error)
  }
}

export const createLock = async (event: any) => {
  /**
   * Allowed roles: Customer
   */
  try {
    // Decoded token
    const decodedToken = jwt_decode(event.headers.Authorization)

    // Get customerId
    const customerId = decodedToken['custom:userCode']

    // Destructure body
    // NOTE: station name and price should be queried from the database
    const {station_id, fuel_type} = JSON.parse(event.body)

    // Connect to database
    await connectToDatabase()

    // Get price
    const station = await Station.findOne({station_id: station_id})

    // Get prices
    const currentPrices = station.current_prices

    // Look for price
    const foundPrice = currentPrices.find((element: any) => element.fuel_type == fuel_type)

    // -- Put data in booking collection

    // Supply bookingID
    const bookingID = new ShortUniqueId({length: 8, dictionary: "alphanum_lower"})()

    // Supply claim code
    const claim_code = new ShortUniqueId({length: 8, dictionary: "alphanum_lower"})()

    // Supply expiry date
    const now = new Date()

    // TODO: ONE WEEK FOR PROD BUT LETS TEST FOR NOW
    // Add a week expiry

    // now.setDate(now.getDate() + 7)
    now.setTime(now.getTime() + 3 * 60000)

    // Convert to ISO
    const ISODate = now.toISOString()

    // Supply booking parameters
    const newBooking = new Booking({
      booking_id: bookingID,
      customer_id: customerId,
      station_id: station_id,
      address: station.address,
      station_name: station.name,
      fuel_type: fuel_type.toLowerCase(),
      price: foundPrice.price,
      booking_date: new Date().toISOString(),
      expiry_date: ISODate,
      claim_code: claim_code,
      status: 'Open'
    })

    // -- Put data in customer collection (just push booking_id, station_name, fuel_type, and price)

    // Get parameters to push
    const parameters = {
      booking_id: bookingID,
      station_name: station.name,
      fuel_type: fuel_type.toLowerCase(),
      price: foundPrice.price,
      status: "Open"
    }

    // Find user
    const user = await User.findOne({customer_id: customerId})

    // Push values
    user.bookings.push(parameters)

    // -- Call event bridge

    // Convert ISO to javascript date
    const newDate = new Date(ISODate)

    // Convert expiry date to cron
    const cronDate = dateToCron(newDate)

    // Event bridge rule parameters
    const ruleParameters = {
      Name: `expiry-booking-${bookingID}`,
      Description: 'Set expiry of a booking',
      ScheduleExpression: `cron(${cronDate})`,
      State: 'ENABLED',
    }

    // Call event bridge
    const eventRule = await EventBridge.putRule(ruleParameters).promise()

    console.log(eventRule)

    // Supply event JSON
    const payload = {
      "booking_id": bookingID,
      "customer_id": customerId,
      "type": "EXPIRE_LOCK"
    }

    // Event bridge add target
    const targetParameters = {
      Rule: `expiry-booking-${bookingID}`,
      Targets: [{
        Arn: `arn:aws:lambda:ap-southeast-1:${process.env.AWS_ACCOUNT}:function:priceUpdater-${process.env.DEPLOYMENT_ENV}`,
        Id: bookingID,
        Input: JSON.stringify(payload)
      }]
    }

    const eventTarget = await EventBridge.putTargets(targetParameters).promise()

    console.log(eventTarget)

    // Save database
    await newBooking.save()
    await user.save()
    return gatewayResponse(responseTypes.SAVE, newBooking)
  } catch (error) {
    return errorHandler(error)
  }
}

export const deleteLock = async (event: any) => {
  /**
   * Allowed roles: customer
   */
  try {
    // Get bookingID in query parameters
    const bookingId = event.queryStringParameters.booking_id

    // Throw error if booking_id is undefined
    if(!bookingId)
      throw new MissingQueryParams('booking_id')

    // Connect database
    await connectToDatabase()

    // Find lock
    const lock = await Booking.deleteOne({booking_id: bookingId, status: {$ne: 'Open'}})

    // Check if lock does not exist
    if(!lock)
      throw new LockIsStillOpen()

    // Decode token
    const decodedToken = jwt_decode(event.headers.Authorization)

    // Get customer_id
    const customerID = decodedToken['custom:userCode']

    // -- Delete in customer collection

    // Find user
    const customer = await User.findOne({customer_id: customerID})

    // Update bookings
    const customerBookings = customer.bookings

    // Find booking in the array
    const foundLock = customerBookings.find((element: any) => element.booking_id == bookingId)

    // Get index
    const index = customerBookings.indexOf(foundLock)

    // Delete lock in bookings array
    if(index > -1)
      customerBookings.splice(index, 1)

    // Update customer bookings
    customer.bookings = customerBookings

    // Save to database
    await customer.save()

    return gatewayResponse(responseTypes.DELETE, customer)
  } catch (error) {
    return errorHandler(error)
  }
}

const acceptLock = async (event: any) => {
  /**
   * Allowed roles: dealer, station
   */
  try {
    // Decode token
    const decodedToken = jwt_decode(event.headers.Authorization)

    // Get role
    const role = decodedToken["custom:role"]

    // Check if role is authorized
    if (role == 'customer')
      throw new UnauthorizedAction()

    // Get claim code
    const claimCode = JSON.parse(event.body).claim_code

    let stationId
    if (role == 'employee')
      stationId = decodedToken['custom:stationID']
    else
      stationId = JSON.parse(event.body).station_id

    // Connect to database
    await connectToDatabase()

    // -- Accept booking in booking collection

    // Find booking
    const booking = await Booking.findOne({claim_code: claimCode})

    // Throw error if booking does not exist
    if (!booking)
      throw new LockDoesNotExist()

    // Check if booking is owned to the station
    if (booking.station_id != stationId)
      throw new UnauthorizedAction()

    // Check if booking status is expired
    if (booking.status != "Open")
      throw new LockCannotBeClaimed()

    // Update claim code
    booking.claim_code = undefined

    // Update status
    booking.status = "Used"

    // Update redeem date
    booking.redeem_date = new Date().toISOString()

    // -- Accept booking in customer
    const customer = await User.findOne({customer_id: booking.customer_id})

    // Update customer booking
    const customerBookings = customer.bookings

    // Find booking
    const foundBooking = customerBookings.find((element: any) => element.booking_id == booking.booking_id)

    // Get index
    const index = customerBookings.indexOf(foundBooking)

    // Remove from array
    customerBookings.splice(index, 1)

    // Update found booking status to expired
    foundBooking.status = 'Used'

    // Push found booking
    customerBookings.push(foundBooking)

    // Update customer bookings


    // -- Remove targets from event bridge

    // Remove target parameters
    const removeTargetParameters = {
      Ids: [booking.booking_id],
      Rule: `expiry-booking-${booking.booking_id}`,
      Force: true
    }

    // Call event bridge
    const removeTarget = await EventBridge.removeTargets(removeTargetParameters).promise()

    console.log(removeTarget)

    // -- Delete rule from event bridge

    // Delete rule parameters
    const deleteRuleParameters = {
      Name: `expiry-booking-${booking.booking_id}`,
      Force: true
    }

    // Call event bridge
    const deleteRule = await EventBridge.deleteRule(deleteRuleParameters).promise()

    console.log(deleteRule)

    // Save to database
    await booking.save()
    await customer.save()

    return gatewayResponse(responseTypes.SAVE, booking)
  } catch (error) {
    return errorHandler(error)
  }
}

export const cancelLock = async (event: any) => {
  /**
   * Allowed roles: customer
   */
  try {
    // Get booking id
    const bookingID = JSON.parse(event.body).booking_id

    // Connect to database
    await connectToDatabase()

    // -- Update booking collection
    const booking = await Booking.findOne({booking_id: bookingID})

    // Throw error if lock does not exist
    if (!booking)
      throw new LockDoesNotExist()

    // Update status
    booking.status = 'Cancelled'

    // Delete claim_code
    booking.claim_code = undefined

    // -- Update customer collection

    // Decode token
    const decodedToken = jwt_decode(event.headers.Authorization)

    // Get customer_id
    const customerID = decodedToken['custom:userCode']

    // Get customer
    const customer = await User.findOne({customer_id: customerID})

    // Update customer booking
    const customerBookings = customer.bookings

    // Find booking
    const foundBooking = customerBookings.find((element: any) => element.booking_id == booking.booking_id)

    // Get index
    const index = customerBookings.indexOf(foundBooking)

    // Remove from array
    customerBookings.splice(index, 1)

    // Update found booking status to expired
    foundBooking.status = 'Cancelled'

    // Push found booking
    customerBookings.push(foundBooking)

    // Update customer bookings
    customer.bookings = customerBookings

    // -- Remove targets from event bridge

    // Remove target parameters
    const removeTargetParameters = {
      Ids: [booking.booking_id],
      Rule: `expiry-booking-${booking.booking_id}`,
      Force: true
    }

    // Call event bridge
    const removeTarget = await EventBridge.removeTargets(removeTargetParameters).promise()

    console.log(removeTarget)

    // -- Delete rule from event bridge

    // Delete rule parameters
    const deleteRuleParameters = {
      Name: `expiry-booking-${booking.booking_id}`,
      Force: true
    }

    // Call event bridge
    const deleteRule = await EventBridge.deleteRule(deleteRuleParameters).promise()

    console.log(deleteRule)

    // Save to database
    await booking.save()
    await customer.save()

    return gatewayResponse(responseTypes.SAVE, booking)
  } catch (error) {
    return errorHandler(error)
  }
}