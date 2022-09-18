import {
  Stack,
  StackProps,
  aws_ec2,
  aws_ecs,
  aws_logs,
  aws_ecr,
  aws_iam,
} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {prefix} from './common';


export interface IEcsStack {
  vpcId: `vpc-${string}`
  ecr: {
    fastapi: {
      name: string
      tag: string
    }
  }
  ecs: {
    taskMemoryLimit: number
    taskCpu: number
  }
}

export class EcsStack extends Stack {
  constructor(scope: Construct, id: string, params: IEcsStack, props?: StackProps) {
    super(scope, id, props);

    const accountId = Stack.of(this).account;
    const region = Stack.of(this).region;
    const vpc = aws_ec2.Vpc.fromLookup(this, "vpc", {
      vpcId: params.vpcId
    })

    const cluster = new aws_ecs.Cluster(this, 'fargate-cluster', {
      vpc: vpc,
      clusterName: `${prefix}-cluster`,
      enableFargateCapacityProviders: true,
    });

    // create a task definition with CloudWatch Logs
    // need to create logstream before deploy
    const logging = new aws_ecs.AwsLogDriver({
      streamPrefix: prefix,
      logGroup: aws_logs.LogGroup.fromLogGroupName(this, "log-group", `/aws/ecs/${prefix}`),
    })

    /** ECR Repository: backend */
    const ecrRepositoryBackend = aws_ecr.Repository.fromRepositoryArn(
      this, "backend",
      `arn:aws:ecr:${region}:${accountId}:repository/${params.ecr.fastapi.name}`
    )
    const containerImageBackend = aws_ecs.ContainerImage.fromEcrRepository(ecrRepositoryBackend, params.ecr.fastapi.tag)

    /** ECS: execution-roke */
    const executionRole = new aws_iam.Role(this, "execution-role", {
      roleName: `${prefix}-ecs-execution-role`,
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromManagedPolicyArn(this, "executeCloudWatchFullAccess", "arn:aws:iam::aws:policy/AWSOpsWorksCloudWatchLogs"),
        aws_iam.ManagedPolicy.fromManagedPolicyArn(this, "executeEcrReadAccess", "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly")
      ]
    })

    /** ECS: task-role */
    const taskRole = new aws_iam.Role(this, "task-role", {
      roleName: `${prefix}-ecs-task-role`,
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromManagedPolicyArn(this, 'taskCloudWatchFullAccess', 'arn:aws:iam::aws:policy/CloudWatchFullAccess'),
        /** Add managed policy to use SSM */
        aws_iam.ManagedPolicy.fromManagedPolicyArn(
          this, "taskAmazonEC2RoleforSSM", "arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM"
        )
      ]
    })

    const taskFargate = new aws_ecs.FargateTaskDefinition(this, `ecs-task`, {
      family: `${prefix}-task`,
      memoryLimitMiB: params.ecs.taskMemoryLimit,
      cpu: params.ecs.taskCpu,
      executionRole: executionRole,
      taskRole: taskRole,
    })

    taskFargate.addContainer("ecs-task-fastapi", {
      containerName: "fastapi",
      image: containerImageBackend,
      portMappings: [
        {
          containerPort: 80,
          hostPort: 80
        }
      ],
      logging,
    })

    new aws_ecs.FargateService(this, "ecs-service", {
      serviceName: `${prefix}-service`,
      cluster,
      taskDefinition: taskFargate,
      assignPublicIp: true,
      capacityProviderStrategies: [
        {
          capacityProvider: "FARGATE_SPOT",
          weight: 1
        }
      ],
      enableExecuteCommand: true
    })
  }
}
