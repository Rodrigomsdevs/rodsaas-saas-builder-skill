-- Cria (se preciso) e configura um banco do projeto.
-- Variáveis psql: target_db, owner_user, app_user, db_exists (true/false, calculado pelo provision.sh)

\if :db_exists
\else
  CREATE DATABASE :"target_db" OWNER :"owner_user" ENCODING 'UTF8' TEMPLATE template0;
\endif

-- Só os dois usuários do projeto conectam neste banco.
REVOKE ALL ON DATABASE :"target_db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"target_db" TO :"owner_user", :"app_user";

\connect :"target_db"
SET client_min_messages = warning;

-- O dono das migrations é dono do schema; ninguém mais cria objetos nele.
ALTER SCHEMA public OWNER TO :"owner_user";
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_user";

-- Tabelas e sequences que as migrations criarem no futuro: só DML para a aplicação.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";

-- O que já existir (quando a skill é executada de novo num banco com tabelas).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";

-- A aplicação nunca mexe no histórico de migrations do Prisma.
SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS has_prisma_migrations \gset
\if :has_prisma_migrations
  REVOKE INSERT, UPDATE, DELETE ON public._prisma_migrations FROM :"app_user";
\endif

-- pg-boss cria as tabelas dele dentro deste schema, que pertence à aplicação.
CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION :"app_user";
