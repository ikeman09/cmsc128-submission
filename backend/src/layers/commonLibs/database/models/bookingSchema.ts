export {}

const mongoose = require('mongoose')

const bookingSchema = new mongoose.Schema({
  booking_id: {
    type: String,
    require: true
  },
  customer_id: {
    type: String,
    require: true
  },
  station_id: {
    type: String,
    require: true
  },
  station_name: {
    type: String,
    require: true,
  },
  fuel_type: {
    type: String,
    require: true
  },
  address: {
    type: String,
    require: true
  },
  price: {
    type: String,
    require: true
  },
  booking_date: {
    type: String,
    require: true
  },
  redeem_date: {
    type: String,
    require: true
  },
  expiry_date: {
    type: String,
    require: true,
  },
  claim_code: {
    type: String,
    require: true
  },
  status: {
    type: String,
    enum: ['Open', 'Expired', 'Used', 'Cancelled']
  }
})

module.exports = mongoose.model('Bookings', bookingSchema)

