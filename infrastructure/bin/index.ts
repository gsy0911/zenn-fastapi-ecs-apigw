import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as lib from '../lib/';

const app = new cdk.App();
new lib.EcsStack(app, `zenn-example-ecs`, lib.paramsEcsStack, {env: lib.env});
