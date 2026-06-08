SELECT 
  COUNT(*) as total,
  MIN(date) as fecha_min,
  MAX(date) as fecha_max
FROM transactions
WHERE source = 'open-banking';

-- Ver cuántas son de CC facturada vs no facturada vs cuenta
SELECT bank_source, COUNT(*) 
FROM transactions 
WHERE source = 'open-banking'
GROUP BY bank_source;

delete from transactions;

SELECT COUNT(*) FROM transactions;