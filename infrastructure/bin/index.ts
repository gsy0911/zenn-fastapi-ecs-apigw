import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as lib from '../lib/';

const app = new cdk.App();
const vpc = new lib.VpcStack(app, `zenn-example-vpc`, {env: lib.env});
const ecs = new lib.EcsStack(app, `zenn-example-ecs`, lib.paramsEcsStack, {env: lib.env});
const apigw = new lib.ApigwStack(app, `zenn-example-apigw`, {env: lib.env});

//スタックの依存関係を定義
ecs.addDependency(vpc)
apigw.addDependency(ecs)
