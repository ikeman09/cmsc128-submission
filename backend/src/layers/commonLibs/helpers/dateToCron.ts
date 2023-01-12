/**
 *
 * @param date
 * NOTE!! date should always be in ISO format
 */
const dateToCron = (date: any) => {
  const minutes = date.getMinutes()
  const hours = date.getHours()
  const days = date.getDate()
  const months = date.getMonth() + 1
  const year = date.getFullYear()

  return `${minutes} ${hours} ${days} ${months} ? ${year}`
}

module.exports = dateToCron