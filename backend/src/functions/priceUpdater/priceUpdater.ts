const AWS = require('aws-sdk')
const EventBridge = new AWS.EventBridge()
const {errorHandler} = require('/opt/returns/errorHandler')
const {responseTypes, gatewayResponse} = require('/opt/returns/successMessages')
const connectToDatabase = require('/opt/database/mongoDatabase')
const Station = require('/opt/database/models/stationSchema')
const Booking = require('/opt/database/models/bookingSchema')
const User = require('/opt/database/models/userSchema')

/**
 * TODO: INCORPORATE NUMBER IF LOCKS AND FUEL DISCOUNT AFTER TECHNO CLASS
 */
exports.handler = async (event: any) => {
  try {
    switch(event.type) {
      case 'CREATE_PRICE': {
        return await createPrice(event)
      }
      case 'EXPIRE_LOCK': {
        return await expireLock(event)
      }
    }
  } catch (error) {
    return errorHandler(error)
  }
}

/**
 * Deletes price schedule and pushes to current prices
 */
export const createPrice = async (event: any) => {
  try {
    // Destructure event
    const {station_id, fuel_type, price, target_id} = event

    // Connect to database
    await connectToDatabase()

    // Search for station
    const station = await Station.findOne({station_id: station_id})

    // -- Find and delete element in price_schedules

    const priceSchedules = station.price_schedules

    // Get element from array
    const foundPrice = priceSchedules.find((element: any) => element.fuel_type == fuel_type)

    // Get index of found price
    const index = priceSchedules.indexOf(foundPrice)

    // TODO: DONT DELETE ELEMENT PRICE SCHEDULE SHOULD BE HISTORICAL
    // Delete element
    priceSchedules.splice(index, 1)

    // -- Push or update element in current_prices
    const currentPrices = station.current_prices

    // Set parameters to be pushed
    const parameters = {
      fuel_type: fuel_type,
      price: price
    }

    // Get element from array
    const currentFuel = currentPrices.find((element: any) => element.fuel_type == fuel_type)

    // Check if current fuel exists
    if (!currentFuel) {

      // Push price to current_prices
      currentPrices.push(parameters)

      // Save database
      station.price_schedules = priceSchedules
      station.current_prices = currentPrices
      await station.save()

      return gatewayResponse(responseTypes.SAVE, station)
    }

    // Get index of current price
    const indexCurrentPrices = currentPrices.indexOf(currentFuel)

    // Delete current price
    currentPrices.splice(indexCurrentPrices, 1)

    // Push price to current prices
    currentPrices.push(parameters)

    // Update prices
    station.price_schedules = priceSchedules
    station.current_prices = currentPrices

    // -- Remove targets from event bridge

    // Remove target parameters
    const removeTargetParameters = {
      Ids: [target_id],
      Rule: `price-updater-${target_id}`,
      Force: true
    }

    // Call event bridge
    const removeTarget = await EventBridge.removeTargets(removeTargetParameters).promise()

    console.log(removeTarget)

    // -- Delete rule from event bridge

    // Delete rule parameters
    const deleteRuleParameters = {
      Name: `price-updater-${target_id}`,
      Force: true
    }

    // Call event bridge
    const deleteRule = await EventBridge.deleteRule(deleteRuleParameters).promise()

    console.log(deleteRule)

    // Save database
    await station.save()

    return gatewayResponse(responseTypes.SAVE, station)
  } catch (error) {
    return errorHandler(error)
  }
}

export const expireLock = async (event: any) => {
  try {
    // Connect to database
    await connectToDatabase()

    // -- Update status in booking collection

    // Find booking
    const lock = await Booking.findOne({booking_id: event.booking_id})

    // Update lock
    lock.status = 'Expired'

    // Remove claim_code
    lock.claim_code = undefined

    // -- Update status in customer collection
    const customer = await User.findOne({customer_id: event.customer_id})

    //
    const customerBookings = customer.bookings

    // Find booking
    const foundBooking = customerBookings.find((element: any) => element.booking_id == event.booking_id)

    // Get index
    const index = customerBookings.indexOf(foundBooking)

    // Remove from array
    customerBookings.splice(index, 1)

    // Update found booking status to expired
    foundBooking.status = 'Expired'

    // Push found booking
    customerBookings.push(foundBooking)

    // Update customer bookings
    customer.bookings = customerBookings

    // -- Remove targets from event bridge

    // Remove target parameters
    const removeTargetParameters = {
      Ids: [event.booking_id],
      Rule: `expiry-booking-${event.booking_id}`,
      Force: true
    }

    // Call event bridge
    const removeTarget = await EventBridge.removeTargets(removeTargetParameters).promise()

    console.log(removeTarget)

    // -- Delete rule from event bridge

    // Delete rule parameters
    const deleteRuleParameters = {
      Name: `expiry-booking-${event.booking_id}`,
      Force: true
    }

    // Call event bridge
    const deleteRule = await EventBridge.deleteRule(deleteRuleParameters).promise()

    console.log(deleteRule)

    // Save to database
    await lock.save()
    await customer.save()

    return gatewayResponse(responseTypes.SAVE, lock)
  } catch (error) {
    return errorHandler(error)
  }
}
