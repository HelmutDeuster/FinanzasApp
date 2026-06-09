SELECT card_last_four, bank_source, COUNT(*) 
FROM transactions 
WHERE source = 'open-banking'
GROUP BY card_last_four, bank_source
ORDER BY card_last_four;

SELECT id, last_four, name, cycle_close_day, cycle_due_day, active
FROM credit_cards;