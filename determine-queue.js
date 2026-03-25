// /* eslint-disable import/no-unresolved */
// const AWS = require('aws-sdk');
// const log = require('./lib/log');

// import log from './lib/log';

// const documentClient = new AWS.DynamoDB.DocumentClient();

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);


import { fromUtf8 } from "@aws-sdk/util-utf8-node";




// const lambda = new AWS.Lambda();

import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";


const env = {
  QUEUE_TABLE: process.env.QUEUE_TABLE,
  PHRASES_LAMBDA: process.env.PHRASES_LAMBDA,
};

const pickRandomlyFromArray = (array) => {
  if (!array) {
    return null;
  }

  const index = Math.floor(Math.random() * array.length);

  return index >= 0 && index < array.length
    ? array[index]
    : array[0];
};

const removeWhitespace = word => word.replace(/\s+/g, '');

// const queryQueues = async (region, language, caseType, accountType, countryCode) => {
  
//   const command = new QueryCommand({
//     TableName: env.QUEUE_TABLE,
//     ExpressionAttributeNames: { // reserved keywords
//       '#region': :'region',
//       '#except': :'except',
//     },
//     ExpressionAttributeValues: {
//       ':region': removeWhitespace(region),
//       ':language': removeWhitespace(language),
//       ':caseType': removeWhitespace(caseType),
//       ':accountType': removeWhitespace(accountType),
//       ':countryCode' : removeWhitespace(countryCode),
//       ':all': '*',
//     },
//     KeyConditionExpression: '#region = :region',
//       FilterExpression: `
//         (
//           (contains(languages.includes, :language) OR contains(languages.includes, :all))
//           AND
//           (NOT contains(languages.#except, :language))
//           AND
//           (contains(countryCode, :countryCode) OR contains(countryCode, :all))
//         )
//         AND
//         (
//           (contains(caseTypes.includes, :caseType) OR contains(caseTypes.includes, :all))
//           AND
//           (NOT contains(caseTypes.#except, :caseType))
//         )
//         AND
//         (
//           (contains(accountTypes.includes, :accountType) OR contains(accountTypes.includes, :all))
//           AND
//           (NOT contains(accountTypes.#except, :accountType))
//         )`,
//       ProjectionExpression: 'queueARN, afterHours, priority, coreEndTime',
//     });

  // const queryQueues = async (region, language, caseType, accountType, countryCode) => {
  // const cleanedRegion = removeWhitespace(region);
  // console.log("cleanedRegion",typeof cleanedRegion)
  // const cleanedLanguage = removeWhitespace(language);
  // const cleanedCaseType = removeWhitespace(caseType);
  // const cleanedAccountType = removeWhitespace(accountType);
  // const cleanedCountryCode = removeWhitespace(countryCode);

  // console.log('Cleaned Values:', {
  //   cleanedRegion,
  //   cleanedLanguage,
  //   cleanedCaseType,
  //   cleanedAccountType,
  //   cleanedCountryCode,
  // });
  
const queryQueues = async (region, language, caseType, accountType, countryCode) => {
  try {
    const command = new QueryCommand({
      TableName: env.QUEUE_TABLE,
      ExpressionAttributeNames: {
        '#region': 'region',
        '#except': 'except',
      },
      ExpressionAttributeValues: {
        ':region': removeWhitespace(region),
        ':language': removeWhitespace(language),
        ':caseType': removeWhitespace(caseType),
        ':accountType': removeWhitespace(accountType),
        ':countryCode': removeWhitespace(countryCode),
        ':all': '*',
      },
      KeyConditionExpression: '#region = :region',
      FilterExpression: `
        (
          (contains(languages.includes, :language) OR contains(languages.includes, :all))
          AND
          (NOT contains(languages.#except, :language))
          AND
          (contains(countryCode, :countryCode) OR contains(countryCode, :all))
        )
        AND
        (
          (contains(caseTypes.includes, :caseType) OR contains(caseTypes.includes, :all))
          AND
          (NOT contains(caseTypes.#except, :caseType))
        )
        AND
        (
          (contains(accountTypes.includes, :accountType) OR contains(accountTypes.includes, :all))
          AND
          (NOT contains(accountTypes.#except, :accountType))
        )`,
      ProjectionExpression: 'queueARN, afterHours, priority, coreEndTime',
    });

    const result = await docClient.send(command);

    if (!result || !result.Items || result.Items.length === 0) {
      return null;
    }

    const priority = Math.min(...result.Items.map(q => q.priority || Number.MAX_SAFE_INTEGER));
    const prioritizedQueues = result.Items
      .filter(q => (q.priority || Number.MAX_SAFE_INTEGER) === priority);

    return prioritizedQueues.length > 1
      ? pickRandomlyFromArray(prioritizedQueues)
      : prioritizedQueues[0];
  } catch (error) {
    console.error("Error querying DynamoDB:", error);
    throw error;
  }
};


// const lookupPrompt = async (prompt, language) => {
//   if (!prompt) {
//     return '';
//   }

//   const result = await LambdaClient.invoke({
//     FunctionName: env.PHRASES_LAMBDA,
//     Payload: JSON.stringify({
//       language,
//       phraseIds: [prompt],
//     }),
//   }).promise();

//   if (!result || !result.Payload || result.StatusCode !== 200) {
//     return '';
//   }

//   const phrases = JSON.parse(result.Payload);

//   return phrases[`${prompt}-value`] || '';
// };


// Configure the AWS SDK logger (optional)


const lookupPrompt = async (prompt, language) => {
  if (!prompt) {
    return '';
  }

  const client = new LambdaClient({});
  const command = new InvokeCommand({
    FunctionName: env.PHRASES_LAMBDA,
    Payload: fromUtf8(JSON.stringify({
      language,
      phraseIds: [prompt],
    })), // Convert payload to ArrayBuffer
  });

  try {
    const response = await client.send(command);

    // Check Lambda invocation status
    if (!response.Payload || response.StatusCode !== 200) {
      return '';
    }

    // Decode response payload from ArrayBuffer
    const phrases = JSON.parse(Buffer.from(response.Payload).toString("utf-8"));

    return phrases[`${prompt}-value`] || '';
  } catch (error) {
    console.error("Error invoking Lambda function:", error);
    throw error;
  }
};




const processAfterHours = async (queue, language) => {
  if (!queue.afterHours) {
    return {};
  }

  const { afterHours } = queue;
  switch (queue.afterHours.behavior) {
    case 'PLAY-PROMPT':
      afterHours.prompt = await lookupPrompt(afterHours.prompt, language);
      break;
    case 'EXTERNAL-TRANSFER':
      if (afterHours.externalNumber) {
        const index = Math.floor(Math.random() * Math.floor(afterHours.externalNumber.length));
        afterHours.externalNumber = afterHours.externalNumber[index];
      }
      if (afterHours.externalNumber1) {
        const index = Math.floor(Math.random() * Math.floor(afterHours.externalNumber1.length));
        afterHours.externalNumber1 = afterHours.externalNumber1[index];
      }
    default:
      break;
  }

  return Object.keys(afterHours).reduce((acc, curr) => {
    acc[`afterHours-${curr}`] = queue.afterHours[curr];
    return acc;
  }, {});
};

export const lambdaHandler = async (event,context) => {
  try {
    // log.debug('Invoked with Event', JSON.stringify(event));
    console.log('Invoked with Event', JSON.stringify(event));
    console.log(JSON.stringify(event));

    const {
      region, language,
    } = event.Details.Parameters;

    if (!region || !language) {
      throw new Error('Region, language are required');
    }

    let {
      caseType, accountType, countryCode //ziy-countryCode
    } = event.Details.Parameters;

    caseType = caseType || 'Unknown';
    accountType = accountType || 'Unknown';
    countryCode = countryCode;

    const queue = await queryQueues(region, language, caseType, accountType, countryCode)
      || await queryQueues('Global', language, caseType, accountType, countryCode);

    if (!queue) {
      throw new Error(`No queue matches region ${region}, language ${language}, case type ${caseType}, countryCode ${countryCode} and account type ${accountType}`);
    }

    const afterHours = await processAfterHours(queue, language);

    return {
      queueARN: queue.queueARN,
      coreEndTime: queue.coreEndTime,
//      "afterHours-queueARN": queue.afterHours.queueARN,
      ...afterHours,
    };
  } catch (err) {
    // log.error('An error has occurred', err && err.message);
    console.log('An error has occurred', err && err.message);
    throw err;
  }
};
