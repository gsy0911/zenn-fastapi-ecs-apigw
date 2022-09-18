import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as lib from '../lib/';

const app = new cdk.App();
new lib.VpcStack(app, `zenn-example-vpc`, {env: lib.env});
new lib.EcsStack(app, `zenn-example-ecs`, lib.paramsEcsStack, {env: lib.env});
new lib.ApigwStack(app, `zenn-example-apigw`, lib.paramsApigwStack, {env: lib.env});
