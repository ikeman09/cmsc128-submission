const b64 = require('base64-js');
const encryptionSdk = require('@aws-crypto/client-node');

// Configure the encryption SDK client with the KMS key from the environment variables.
const {encrypt, decrypt} = encryptionSdk.buildClient(encryptionSdk.CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT);
const generatorKeyId = process.env.KMS_KEY_ALIAS;
const keyIds = [process.env.KMS_KEY_ARN];
const keyring = new encryptionSdk.KmsKeyringNode({generatorKeyId, keyIds})

const sgMail = require('@sendgrid/mail')

exports.handler = async (event: any) => {
  try {
    // Decrypt the secret code using encryption SDK.
    let plainTextCode;

    if (event.request.code) {
      const {plaintext, messageHeader} = await decrypt(keyring, b64.toByteArray(event.request.code));
      plainTextCode = plaintext
    }

    const verificationCode = `${plainTextCode}` // jutsu to convert this Buffer value to a real plain text

    const user: any = event.request.userAttributes
    /**
     * USER ATTRIBUTES (request.userAttributes)
     *     sub:
     *     'cognito:email_alias': 'asdf@gmail.com',
     *     'cognito:user_status': 'CONFIRMED',
     *     email_verified: 'true',
     *     family_name: 'Mira',
     *     given_name: 'Johnny',
     *     'custom:customercode': 'asdf1234',
     *     'custom:role': 'customer',
     *     email: 'asdf@gmail.com'
     */

    /**
     * Build the message body
     */
    let subject = "";
    let messageBody = "";
    let dynamicTemplateData = {} // for sendgrid
    let templateId
    let activateUrl = "";
    // let domain = "https://app.myrace.ph"
    // if (event.request.clientMetadata) {
    //   // let countryCode = event.request.clientMetadata.countryCode
    //   // domain = countryCode === 'nz' ? 'https://app.getstamped.co.nz' : 'https://app.getstamped.com.au'
    //   //todo: base64 encrypt the parameters
    //   activateUrl = domain + '/verify?' + `c=${verificationCode}&e=${user.email}&p=${event.request.clientMetadata.pass}`
    // }

    /**
     * TRIGGER SOURCES
     CustomEmailSender_SignUp  A user signs up and Amazon Cognito sends a welcome message.
     CustomEmailSender_ForgotPassword  A user requests a code to reset their password.
     CustomEmailSender_ResendCode  A user requests a replacement code to reset their password.
     CustomEmailSender_UpdateUserAttribute  A user updates an email address or phone number attribute and Amazon Cognito sends a code to verify the attribute.
     CustomEmailSender_VerifyUserAttribute  A user creates a new email address or phone number attribute and Amazon Cognito sends a code to verify the attribute.
     CustomEmailSender_AdminCreateUser  You create a new user in your user pool and Amazon Cognito sends them a temporary password.
     CustomEmailSender_AccountTakeOverNotification  Amazon Cognito detects an attempt to take over a user account and sends the user a notification.
     */

    switch (event.triggerSource) {
      case "CustomEmailSender_SignUp": { //note: this will NOT work for participants, because they are autoConfirmed from preSignup lambda
        subject = 'Welcome to Gasolater!'
        // messageBody = `Hi ${user.given_name} ${user.family_name},<br/><br/>
        //                 <h3>Welcome to MyRace!</h3>
        //                 <p>Activate your account by clicking the button below.</p>
        //                 <a href="${activateUrl}" style="text-decoration: none;">
        //                   <div style="color: #fff;
        //                   background-color: #B10000;
        //                   font-size: 1rem;
        //                   padding: 6px 16px;
        //                   font-weight: 600;
        //                   border-radius: 5px;
        //                   width: 100px;
        //                   text-align: center">Activate</div>
        //                 </a>
        //                 <br/><br/>
        //                 <p>Alternatively, you may enter the activation code below into MyRace, then login win your temporary password.</p>
        //                 <div>Your activation code:</div>
        //                 <h2 style="letter-spacing: 5px; font-weight: 600;">${verificationCode}</h2>`
        // // send temporary password for owner only
        // if (event.request.clientMetadata && user['custom:role'] === 'owner') {
        //   messageBody = messageBody + `<p>Your temporary password is: <h3 style="letter-spacing: 3px;font-weight: 600;">${event.request.clientMetadata.pass}</h3> You will need this to log in after account activation. It is advisable to change this on your first login.</p>`
        // }

        dynamicTemplateData = {
          first_name: user.given_name,
          code: verificationCode,
          password: event.request.clientMetadata?.pass
        }
        templateId = process.env.SENDGRID_ACTIVATE_TEMPLATE_ID

        break;
      }
      case "CustomEmailSender_ForgotPassword":
        subject = 'Gasolater - Password Reset'
        // messageBody = `Hi ${user.given_name} ${user.family_name},<br/><br/>
        //                 <p>A password reset has been requested for your account.</p>
        //                 <p>To proceed, please use the confirmation code below.</p>
        //                 <h2 style="letter-spacing: 5px; font-weight: 600;">${verificationCode}</h2>
        //                 <br/>
        //                 <p>If you did not make this request, you do not need to do anything.</p>`

        dynamicTemplateData = {
          name: user.name,
          code: verificationCode
        }
        templateId = process.env.SENDGRID_FORGOTPASSWORD_TEMPLATE_ID

        break;
    // case "CustomEmailSender_ResendCode": {
    //   subject = 'MyRace - Sign Up (Re-send Code)'
    //   // messageBody = `Hi ${user.given_name} ${user.family_name},<br/><br/>
    //   //                 <h3>Welcome to MyRace!</h3>
    //   //                 <p>Activate your account by clicking the button below.</p>
    //   //                 <a href="${activateUrl}" style="text-decoration: none;">
    //   //                   <div style="color: #fff;
    //   //                   background-color: #B10000;
    //   //                   font-size: 1rem;
    //   //                   padding: 6px 16px;
    //   //                   font-weight: 600;
    //   //                   border-radius: 5px;
    //   //                   width: 100px;
    //   //                   text-align: center">Activate</div>
    //   //                 </a>
    //   //                 <br/><br/>
    //   //                 <p>Alternatively, you may enter the activation code below into MyRace, then login win your temporary password.</p>
    //   //                 <div>Your activation code:</div>
    //   //                 <h2 style="letter-spacing: 5px; font-weight: 600;">${verificationCode}</h2>`
    //   // // send temporary password for owner only
    //   // if (event.request.clientMetadata && user['custom:role'] === 'owner') {
    //   //   messageBody = messageBody + `<p>Your temporary password is: <h3 style="letter-spacing: 3px;font-weight: 600;">${event.request.clientMetadata.pass}</h3> You will need this to log in after account activation. It is advisable to change this on your first login.</p>`
    //   // }
    //
    //   dynamicTemplateData = {
    //     first_name: user.given_name,
    //     code: verificationCode,
    //     password: event.request.clientMetadata?.pass
    //   }
    //   templateId = process.env.SENDGRID_ACTIVATE_TEMPLATE_ID
    //
    //   break;
    // }
      case "CustomEmailSender_UpdateUserAttribute":
      case "CustomEmailSender_VerifyUserAttribute":
      case "CustomEmailSender_AdminCreateUser":
      case "CustomEmailSender_AccountTakeOverNotification":
      default: {
        console.warn("Unknown trigger source: ", event.triggerSource);
        return;
      }
    }


    /**
     * Call the email sender
     */
    const emailConfig = {
      personalizations: [
        {
          to: user.email,
          subject: subject,
          dynamic_template_data: dynamicTemplateData
        }
      ],
      template_id: templateId,
      from: {
        email: "contact@gasolater.ph",
        name: "Gasolater"
      }
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY)
    await sgMail.send(emailConfig)
    return

  } catch (error) {

  }
}
