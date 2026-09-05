my-commands:cmds

docker-install:
	@if docker --version >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then \
		echo "`docker --version`"; \
		echo "`docker compose version`"; \
		echo "Docker already installed"; \
	else \
		sudo apt-get update && \
		sudo apt-get install -y ca-certificates curl && \
		sudo install -m 0755 -d /etc/apt/keyrings && \
		sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && \
		sudo chmod a+r /etc/apt/keyrings/docker.asc && \
		echo "deb [arch=$$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $$([ -f /etc/os-release ] && . /etc/os-release && echo $$VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null && \
		sudo apt-get update && \
		sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && \
		echo "Docker installed successfully"; \
		echo "`docker --version`"; \
		echo "`docker compose version`";	\
	fi

nginx-install:
	@nginx -v >/dev/null 2>&1 && certbot --version >/dev/null 2>&1 && echo "Nginx and Certbot already installed" || ( \
		sudo apt-get update && \
		sudo apt-get install -y nginx certbot python3-certbot-nginx && \
		sudo systemctl enable nginx && \
		sudo systemctl start nginx && \
		echo "Nginx and Certbot installed successfully"; \
		nginx -v; \
		certbot --version; \
	)

docker-compose-build:
	@docker-compose build --no-cache

deploy-frontend:
	@./deploy-frontend.sh

docker-compose-up:
	@sudo docker-compose up -d
	@sudo docker image prune -a -f

docker-compose-down:
	@sudo docker-compose down

nginx-restart:
	sudo systemctl restart nginx


docker-compose-restart: deploy-frontend docker-compose-down docker-compose-build docker-compose-up nginx-restart
	@echo "Docker compose restarted."


cmds:
	@echo "Available commands:"
	@echo " make docker-install - to install Docker and Docker Compose"
	@echo "  make nginx-install - to install Nginx and Certbot"
	@echo "  make deploy-frontend - to deploy all frontend apps"
	@echo "  make docker-compose-restart - to restart the docker compose"
	@echo "  make docker-compose-build - to build the docker compose"
	@echo "  make deploy-frontend - to deploy all frontend apps"
	@echo "  make docker-compose-restart - to restart the docker compose"
	@echo "  make nginx-restart - to restart Nginx"
	@echo "  make docker-compose-down - to stop the docker compose"