export {}

const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  customer_id: {
    type: String,
    require: true,
    index: true
  },
  email: {
    type: String,
    require: true,
    index: true
  },
  name: {
    type: String,
    require: true,
  },
  role: {
    type: String,
    require: true
  },
  plate_numbers: [{
    type: String
  }, {_id: false}],
  bookings: [{
    booking_id: {
      type: String
    },
    fuel_type: {
      type: String
    },
    price: {
      type: String
    },
    station_name: {
      type: String
    },
    status: {
      type: String,
      enum: ['Open', 'Expired', 'Used', 'Cancelled']
    }
  }, {_id: false}]
}, {versionKey: false})

module.exports = mongoose.model('Users', userSchema)
