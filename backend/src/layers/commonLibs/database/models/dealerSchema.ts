export {}

const mongoose = require('mongoose')

const dealerSchema = new mongoose.Schema({
  dealer_id: {
    type: String,
    require: true,
    index: true
  },
  name: {
    type: String,
    require: true
  },
  email: {
    type: String,
    require: true
  },
  station_ids: [String]
}, {versionKey: false})

module.exports = mongoose.model('Dealers', dealerSchema)
