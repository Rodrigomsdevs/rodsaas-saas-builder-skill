
# ------------------------------------------------------------------ Site (landing estática, /rodsaas:landing)
# {{SITE_DOMAIN}} -> {{SITE_ROOT}} (saída do "npm run build" do site/, copiada para cá)
server {
    listen 80;
    listen [::]:80;
    server_name {{SITE_DOMAIN}};
    server_tokens off;
    root {{SITE_ROOT}};
    index index.html;
    charset utf-8;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml application/xml text/plain;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # /precos → precos.html ou precos/index.html (export estático do Next.js)
    location / {
        try_files $uri $uri.html $uri/index.html =404;
    }

    # arquivos com hash no nome: cache de 1 ano
    location /_next/static/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        try_files $uri =404;
    }

    # prints e vídeos do sistema
    location /shots/ {
        add_header Cache-Control "public, max-age=604800";
        add_header X-Content-Type-Options "nosniff" always;
        try_files $uri =404;
    }

    error_page 404 /404.html;
}
# BEGIN WWW
server {
    listen 80;
    listen [::]:80;
    server_name www.{{SITE_DOMAIN}};
    server_tokens off;
    return 301 $scheme://{{SITE_DOMAIN}}$request_uri;
}
# END WWW
