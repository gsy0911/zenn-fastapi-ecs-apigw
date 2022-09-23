import {
  Environment
} from 'aws-cdk-lib';
import {IEcsStack} from './EcsApigwStack';

export const paramsEcsStack: IEcsStack = {
  ecs: {
    taskMemoryLimit: 512,
    taskCpu: 256,
    cloudMapNamespace: "example.com."
  },
  ecr: {
    fastapi: {
      name: "zenn-example",
      tag: "fastapi"
    }
  }
}

export const env: Environment = {
  account: "{your-aws-account}",
  region: "ap-northeast-1"
}
