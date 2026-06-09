SELECT card_last_four, bank_source, COUNT(*), sum(amount)
FROM transactions
WHERE source = 'open-banking'
--AND date >= '2026-05-23'
--AND date <= '2026-06-22'
AND bank_source='credit_card_unbilled'
--AND bank_source IN ('credit_card_unbilled', 'credit_card_billed')
AND installments is null
GROUP BY card_last_four, bank_source
ORDER BY card_last_four;

SELECT type, COUNT(*), SUM(amount) 
FROM transactions 
WHERE source = 'open-banking' AND bank_source = 'account'
group by 1;

SELECT card_last_four, COUNT(*), SUM(amount)
FROM transactions
WHERE source = 'open-banking'
AND bank_source = 'credit_card_unbilled'
GROUP BY card_last_four;


SELECT note, amount, installments
FROM transactions
WHERE source = 'open-banking'
AND installments IS NOT NULL
AND installments != '01/01'
ORDER BY date DESC
LIMIT 20;

SELECT note, amount, installments
FROM transactions
WHERE installments IS NOT NULL 
AND installments != '01/01'
ORDER BY date DESC LIMIT 10;