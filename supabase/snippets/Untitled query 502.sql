-- Activar RLS en todas las tablas
alter table transactions enable row level security;
alter table budgets enable row level security;
alter table goals enable row level security;

-- Políticas: cada usuario solo accede a sus propios registros
create policy "Usuarios ven sus propias transacciones"
  on transactions for all
  using (auth.uid() = user_id);

create policy "Usuarios ven sus propios presupuestos"
  on budgets for all
  using (auth.uid() = user_id);

create policy "Usuarios ven sus propias metas"
  on goals for all
  using (auth.uid() = user_id);