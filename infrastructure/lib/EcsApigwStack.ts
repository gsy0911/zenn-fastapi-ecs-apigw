import {
  App,
  Duration,
  Stack,
  StackProps,
  aws_ssm,
  aws_ec2,
  aws_ecs,
  aws_logs,
  aws_ecr,
  aws_iam,
  aws_servicediscovery,
} from 'aws-cdk-lib';
import {prefix} from './common';
import {VpcLink, HttpApi} from '@aws-cdk/aws-apigatewayv2-alpha';
import {HttpServiceDiscoveryIntegration} from '@aws-cdk/aws-apigatewayv2-integrations-alpha';

const ssmVpcId = `/cdk/${prefix}/vpc/id`
const ssmNamespaceName = `/cdk/${prefix}/cloudmap/namespace/name`
const ssmNamespaceArn = `/cdk/${prefix}/cloudmap/namespace/arn`
const ssmNamespaceId = `/cdk/${prefix}/cloudmap/namespace/id`
const ssmServiceName = `/cdk/${prefix}/cloudmap/service/name`
const ssmServiceArn = `/cdk/${prefix}/cloudmap/service/arn`
const ssmServiceId = `/cdk/${prefix}/cloudmap/service/id`
const ssmEcsSg = `/cdk/${prefix}/ecs/security-group/id`

export class VpcStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new aws_ec2.Vpc(this, "vpc", {
      cidr: "10.0.0.0/16",
      maxAzs: 1,
      subnetConfiguration: [
        {
          subnetType: aws_ec2.SubnetType.PUBLIC,
          name: "public",
          cidrMask: 24
        },
        {
          subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
          name: "private",
          cidrMask: 24,

        },
        {
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
          name: "isolated",
          cidrMask: 28
        }
      ],
    })

    new aws_ssm.StringParameter(this, 'ssmParameter', {
      parameterName: ssmVpcId,
      stringValue: vpc.vpcId,
    });
  }
}


export interface IEcsStack {
  ecr: {
    fastapi: {
      name: string
      tag: string
    }
  }
  ecs: {
    taskMemoryLimit: number
    taskCpu: number
    cloudMapNamespace: string
  }
}

export class EcsStack extends Stack {
  constructor(scope: App, id: string, params: IEcsStack, props?: StackProps) {
    super(scope, id, props);

    const accountId = Stack.of(this).account
    const region = Stack.of(this).region
    const vpc = aws_ec2.Vpc.fromLookup(this, "vpc", {
      vpcId: aws_ssm.StringParameter.valueFromLookup(this, ssmVpcId)
    })

    const cluster = new aws_ecs.Cluster(this, 'fargate-cluster', {
      vpc: vpc,
      clusterName: `${prefix}-cluster`,
      enableFargateCapacityProviders: true,
      defaultCloudMapNamespace: {
        name: params.ecs.cloudMapNamespace
      }
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

    const taskContainer = taskFargate.addContainer("ecs-task-fastapi", {
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

    // SecurityGroup
    const securityGroupEcs = new aws_ec2.SecurityGroup(this, "sg-ecs", {
      vpc: vpc,
      securityGroupName: `${prefix}-ecs-sg`,
    })
    const fargateService = new aws_ecs.FargateService(this, "ecs-service", {
      serviceName: `${prefix}-service`,
      cluster,
      taskDefinition: taskFargate,
      securityGroups: [securityGroupEcs],
      capacityProviderStrategies: [
        {
          capacityProvider: "FARGATE_SPOT",
          weight: 1
        }
      ],
      enableExecuteCommand: true,
      cloudMapOptions: {
        name: "fargate-service-discovery",
        dnsRecordType: aws_servicediscovery.DnsRecordType.SRV,
        container: taskContainer,
        containerPort: 80,
        dnsTtl: Duration.seconds(30),
      }
    })

    new aws_ssm.StringParameter(this, 'ssmServiceId', {
      parameterName: ssmServiceId,
      stringValue: fargateService.cloudMapService?.serviceId || "",
    });
    new aws_ssm.StringParameter(this, 'ssmServiceName', {
      parameterName: ssmServiceName,
      stringValue: fargateService.cloudMapService?.serviceName || "",
    });
    new aws_ssm.StringParameter(this, 'ssmServiceArn', {
      parameterName: ssmServiceArn,
      stringValue: fargateService.cloudMapService?.serviceArn || "",
    });
    new aws_ssm.StringParameter(this, 'ssmNamespaceId', {
      parameterName: ssmNamespaceId,
      stringValue: fargateService.cloudMapService?.namespace.namespaceId || "",
    });
    new aws_ssm.StringParameter(this, 'ssmNamespaceName', {
      parameterName: ssmNamespaceName,
      stringValue: fargateService.cloudMapService?.namespace.namespaceName || "",
    });
    new aws_ssm.StringParameter(this, 'ssmNamespaceArn', {
      parameterName: ssmNamespaceArn,
      stringValue: fargateService.cloudMapService?.namespace.namespaceArn || "",
    });
    new aws_ssm.StringParameter(this, 'ssmEcsSg', {
      parameterName: ssmEcsSg,
      stringValue: securityGroupEcs.securityGroupId,
    });
  }
}

export class ApigwStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = aws_ec2.Vpc.fromLookup(this, "vpc", {
      vpcId: aws_ssm.StringParameter.valueFromLookup(this, ssmVpcId)
    })
    const securityGroupVpcLink = new aws_ec2.SecurityGroup(this, "sg-vpclink", {
      vpc: vpc,
      securityGroupName: `${prefix}-vpclink-sg`,
    })
    const vpcLink = new VpcLink(this, "vpclink", {
      vpcLinkName: `${prefix}-vpclink`,
      vpc,
      securityGroups: [securityGroupVpcLink]
    })
    // ECS security group
    const securityGroupEcsId = aws_ssm.StringParameter.valueFromLookup(this, ssmEcsSg)
    const securityGroupSrcEcs = aws_ec2.SecurityGroup.fromSecurityGroupId(this, "sg-ecs", securityGroupEcsId)
    securityGroupSrcEcs.addIngressRule(securityGroupVpcLink, aws_ec2.Port.allTcp(), "allow ingress from ECS Service")

    const namespace = aws_servicediscovery.PrivateDnsNamespace.fromPrivateDnsNamespaceAttributes(this, "ecs-namespace", {
      namespaceArn: aws_ssm.StringParameter.valueFromLookup(this, ssmNamespaceArn),
      namespaceId: aws_ssm.StringParameter.valueFromLookup(this, ssmNamespaceId),
      namespaceName: aws_ssm.StringParameter.valueFromLookup(this, ssmNamespaceName),
    })
    const service = aws_servicediscovery.Service.fromServiceAttributes(this, "ecs-service", {
      dnsRecordType: aws_servicediscovery.DnsRecordType.A,
      namespace,
      routingPolicy: aws_servicediscovery.RoutingPolicy.WEIGHTED,
      serviceName: aws_ssm.StringParameter.valueFromLookup(this, ssmServiceName),
      serviceId: aws_ssm.StringParameter.valueFromLookup(this, ssmServiceId),
      serviceArn: aws_ssm.StringParameter.valueFromLookup(this, ssmServiceArn),
    })
    new HttpApi(this, 'private-api', {
      apiName: `${prefix}-private-api`,
      description: `connect ECS via CloudMap`,
      defaultIntegration: new HttpServiceDiscoveryIntegration('DefaultIntegration', service, {
        vpcLink,
      }),
    });
  }
}
