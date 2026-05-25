-- Habilitar extensión para UUIDs
create extension if not exists "uuid-ossp";

-- Categorías
create table categories (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  icon text,
  color text,
  type text check (type in ('income', 'expense')) not null
);

-- Transacciones
create table transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  category_id uuid references categories(id),
  amount numeric(12, 2) not null,
  note text,
  date date not null,
  type text check (type in ('income', 'expense')) not null,
  source text check (source in ('manual', 'csv', 'fintoc')) default 'manual',
  created_at timestamptz default now()
);

-- Presupuestos mensuales
create table budgets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  category_id uuid references categories(id) not null,
  amount numeric(12, 2) not null,
  month date not null
);

-- Metas de ahorro
create table goals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  target_amount numeric(12, 2) not null,
  current_amount numeric(12, 2) default 0,
  deadline date
);

-- Categorías iniciales
insert into categories (name, icon, color, type) values
  ('Supermercado', '🛒', '#4CAF50', 'expense'),
  ('Transporte', '🚇', '#2196F3', 'expense'),
  ('Restaurantes', '🍽️', '#FF9800', 'expense'),
  ('Salud', '💊', '#F44336', 'expense'),
  ('Entretenimiento', '🎬', '#9C27B0', 'expense'),
  ('Servicios', '💡', '#607D8B', 'expense'),
  ('Sueldo', '💰', '#4CAF50', 'income'),
  ('Otros ingresos', '📈', '#009688', 'income');
  