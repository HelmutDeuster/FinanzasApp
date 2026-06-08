SELECT card_last_four, bank_source, COUNT(*) 
FROM transactions 
WHERE source = 'open-banking'
GROUP BY card_last_four, bank_source
ORDER BY card_last_four;