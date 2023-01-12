export {}

const mongoose = require('mongoose')

const stationSchema = new mongoose.Schema({
  station_id: {
    type: String,
    require: true,
    index: true
  },
  station_code: {
    type: String,
    require: true,
    index: true
  },
  name: {
    type: String,
    require: true,
  },
  address: {
    type: String,
    require: true
  },
  coordinates: {
    longitude: {
      type: String,
      require: true
    },
    latitude: {
      type: String,
      require: true
    },
  },
  contact_number: {
    type: String,
    require: true
  },
  price_schedules: [{
    fuel_type: {
      type: String,
      require: true,
    },
    price: {
      type: String,
      require: true,
    },
    effectivity_date: {
      type: String,
      require: true,
    },
    event_id: {
      type: String,
      require: true
    }
  }, {_id: false}],
  current_prices: [{
    fuel_type: {
      type: String,
      require: true,
    },
    price: {
      type: Number,
      require: true
    }
  }, {_id: false}],
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended']
  }
}, {versionKey: false})

module.exports = mongoose.model('Stations', stationSchema)