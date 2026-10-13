-- Cria ou atualiza os dois usuários do projeto.
-- Variáveis psql: owner_user, owner_password, owner_createdb (true/false), app_user, app_password

SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'owner_user') AS owner_exists \gset
\if :owner_exists
  ALTER ROLE :"owner_user" WITH LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEROLE NOBYPASSRLS NOREPLICATION;
\else
  CREATE ROLE :"owner_user" WITH LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEROLE NOBYPASSRLS NOREPLICATION;
\endif

-- CREATEDB só em dev: o `prisma migrate dev` cria um "shadow database" temporário.
\if :owner_createdb
  ALTER ROLE :"owner_user" CREATEDB;
\else
  ALTER ROLE :"owner_user" NOCREATEDB;
\endif

-- Usuário da aplicação: sem nenhum privilégio especial e, principalmente, sem BYPASSRLS.
SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') AS app_exists \gset
\if :app_exists
  ALTER ROLE :"app_user" WITH LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
\else
  CREATE ROLE :"app_user" WITH LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
\endif
