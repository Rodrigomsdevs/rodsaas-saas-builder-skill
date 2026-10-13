# rodsaas · {{PROJECT}} — gerado pelo /rodsaas:domain. Não edite à mão sem atualizar a skill.
# Frontend: {{WEB_DOMAIN}} -> 127.0.0.1:{{WEB_PORT}}
# API:      {{API_DOMAIN}} -> 127.0.0.1:{{API_PORT}}
# O certbot acrescenta os blocos HTTPS e o redirecionamento HTTP -> HTTPS neste arquivo
# (o certbot marca as linhas que ele mesmo gerencia).

map $http_upgrade $rodsaas_{{PID}}_connection {
    default upgrade;
    ''      close;
}

upstream rodsaas_{{PID}}_web {
    server 127.0.0.1:{{WEB_PORT}};
    keepalive 16;
}

upstream rodsaas_{{PID}}_api {
    server 127.0.0.1:{{API_PORT}};
    keepalive 16;
}

# ------------------------------------------------------------------ API
server {
    listen 80;
    listen [::]:80;
    server_name {{API_DOMAIN}};
    server_tokens off;

    # A API limita o body em 1 MB; um pouco de folga aqui para a resposta de erro vir da API.
    client_max_body_size 2m;

    location / {
        proxy_pass http://rodsaas_{{PID}}_api;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}

# ------------------------------------------------------------------ Frontend
server {
    listen 80;
    listen [::]:80;
    server_name {{WEB_DOMAIN}};
    server_tokens off;
    client_max_body_size 10m;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    # Navegadores ignoram em HTTP; passa a valer quando o certbot move este bloco para o 443.
    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass http://rodsaas_{{PID}}_web;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $rodsaas_{{PID}}_connection;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}
