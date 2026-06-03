-- Paso 1: actualizar filas existentes
UPDATE transactions SET source = 'txt' WHERE source = 'csv';
UPDATE transactions SET source = 'txt' WHERE source = 'fintoc';

-- Paso 2: agregar la restricción nueva
ALTER TABLE transactions 
ADD CONSTRAINT transactions_source_check 
CHECK (source IN ('manual', 'txt', 'open-banking'));