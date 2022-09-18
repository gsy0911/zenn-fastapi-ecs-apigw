# 定数
ifdef profile
  $(eval AWS_ACCOUNT := $(shell aws sts get-caller-identity --profile $(profile) | jq -r .Account))
else
  $(eval AWS_ACCOUNT := $(shell aws sts get-caller-identity | jq -r .Account))
endif
REGION := ap-northeast-1
REPOSITORY_NAME := zenn-example


.PHONY: help
help: ## show commands ## make
	@printf "\033[36m%-30s\033[0m %-50s %s\n" "[Sub command]" "[Description]" "[Example]"
	@grep -E '^[/a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | perl -pe 's%^([/a-zA-Z_-]+):.*?(##)%$$1 $$2%' | awk -F " *?## *?" '{printf "\033[36m%-30s\033[0m %-50s %s\n", $$1, $$2, $$3}'


.PHONY: login
login: ## login to ECR ## make login
	@aws ecr get-login-password --region $(REGION) | docker login --username AWS --password-stdin $(AWS_ACCOUNT).dkr.ecr.$(REGION).amazonaws.com


.PHONY: build-fastapi
build-fastapi: ## build image ## make build-fastapi
	@docker buildx build --platform linux/amd64 -t fastapi:latest -f fastapi.Dockerfile .


.PHONY: push-fastapi
push-fastapi: ## push image to ecr ## make push-fastapi tag={}
	@echo "push $(tag)"
	@docker tag fastapi:latest $(AWS_ACCOUNT).dkr.ecr.$(REGION).amazonaws.com/$(REPOSITORY_NAME):$(tag)
	@docker push $(AWS_ACCOUNT).dkr.ecr.$(REGION).amazonaws.com/$(REPOSITORY_NAME):$(tag)


.PHONY: ecs-check
ecs-check: ## execute command ## make ecs-check cluster={} task={}
	aws ecs execute-command \
		--cluster $(cluster) \
		--task $(task) \
		--container fastapi \
		--interactive \
		--command "ps aux"
