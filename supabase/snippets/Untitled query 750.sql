SELECT COUNT(*), source, bank_source 
FROM transactions 
GROUP BY source, bank_source
ORDER BY source;

SELECT card_last_four, bank_source, COUNT(*) 
FROM transactions 
WHERE source = 'open-banking'
GROUP BY card_last_four, bank_source
ORDER BY card_last_four;

select count(*)
from transactions;

-- Ver duplicados potenciales
SELECT date, amount, type, note, COUNT(*) as veces
FROM transactions
WHERE source = 'open-banking'
GROUP BY date, amount, type, note
HAVING COUNT(*) > 1
ORDER BY veces DESC
LIMIT 20;