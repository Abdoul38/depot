const pool = require('../config/database');

async function generateUniqueSixDigitNumber(table, column) {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const number = Math.floor(100000 + Math.random() * 900000);
    const fullNumber = 'UDH' + number;
    
    const result = await pool.query(
      `SELECT COUNT(*) FROM ${table} WHERE ${column} = $1`,
      [fullNumber]
    );
    
    if (parseInt(result.rows[0].count) === 0) {
      return fullNumber;
    }
    attempts++;
  }
  
  throw new Error('Impossible de generer un numero unique');
}

module.exports = { generateUniqueSixDigitNumber };