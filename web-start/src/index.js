/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  startAfter,
  limit,
  onSnapshot,
  setDoc,
  updateDoc,
  doc,
  getDoc,
  deleteDoc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  deleteObject,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getPerformance } from 'firebase/performance';

import { getFirebaseConfig } from './firebase-config.js';

// Signs-in Friendly Chat.
async function signInGoogle() {
  // Sign in Firebase using popup auth and Google as the identity provider.
  var provider = new GoogleAuthProvider();
  await signInWithPopup(getAuth(), provider);
}

async function signInFacebook() {
  var provider = new FacebookAuthProvider();
  await signInWithPopup(getAuth(), provider);
}

// Signs-out of Friendly Chat.
function signOutUser() {
  // Sign out of Firebase.
  signOut(getAuth());
}

// Initialize firebase auth
function initFirebaseAuth() {
  // Listen to auth state changes.
  onAuthStateChanged(getAuth(), authStateObserver);
}

// Returns the signed-in user's profile Pic URL.
function getProfilePicUrl() {
  return getAuth().currentUser.photoURL || '/images/profile_placeholder.png';
}

// Returns the signed-in user's display name.
function getUserName() {
  return getAuth().currentUser.displayName;
}

// Returns true if a user is signed-in.
function isUserSignedIn() {
  return !!getAuth().currentUser;
}

// Saves a new message to Cloud Firestore.
async function saveMessage(messageText) {
  // Add a new message entry to the Firebase database.
  try {
    await addDoc(collection(getFirestore(), 'messages'), {
      name: getUserName(),
      text: messageText,
      profilePicUrl: getProfilePicUrl(),
      timestamp: serverTimestamp(),
      favorite: false
    });
  }
  catch(error) {
    console.error('Error writing new message to Firebase Database', error);
  }
}

// Loads chat messages history and listens for upcoming ones.
function loadMessages() {
  const recentMessagesQuery = query(collection(getFirestore(), 'messages'), orderBy('timestamp', 'desc'), limit(3));

  // Start listening to the query.
  onSnapshot(recentMessagesQuery, function(snapshot) {
    snapshot.docChanges().forEach(function(change) {
      if (change.type === 'removed') {
        deleteMessage(change.doc.id);
      } else {
        var message = change.doc.data();
        displayMessage(change.doc.id, message.timestamp, message.name,
                      message.text, message.profilePicUrl, message.imageUrl, message.favorite);
      }
    });
  });
}

/*
Este arreglo es cargado con los cinco mensajes anteriores que se
cargan en el chat, estando estos mensajes en el arreglo desde el
mas reciente al menos reciente
*/
let arrayLoadedMessages = [];

/*
Carga 5 mensajes anteriores cronologicamente hablando, es decir, carga los
5 mensajes anteriores al mensaje que aparece arriba del todo en el chat
*/
async function loadPreviousFiveMessages() {
  /*
  Comprueba que el usuario no este conectado, en cuyo caso el boton
  para cargar los 5 mensajes anteriores no debe realizar dicha carga
  */
  if (!checkSignedInWithMessage()) {
    return;
  }

  /*
  Si no hay mensajes, no es posible mostrar 5 mensajes anteriores
  cronologicamente hablando, por lo tanto, el flujo de ejecucion
  de esta funcion no debe continuar
  */
  if (await noMessages()) {
    alert("No hay mensajes cargados.");
    return;
  }

  let firstMessageChat;

  /*
  Si no se cargaron 5 mensajes anteriores, se obtiene el mensaje que aparece
  arriba del todo en el chat de los tres mensajes mas recientes, los cuales
  son los que aparecen en el chat cuando se carga la aplicacion, y siempre
  que no se cargan 5 mensajes anteriores
  */
  if (arrayLoadedMessages.length == 0) {
    firstMessageChat = await getFirstMessage();
  }

  /*
  Si se cargaron 5 mensajes anteriores, se obtiene el mensaje que aparece
  arriba del todo en el chat de los 5 mensajes cargados, los cuales aparecen
  arriba de los tres mensajes mas recientes que aparecen en el chat siempre
  que no se cargan 5 mensajes anteriores
  */
  if (arrayLoadedMessages.length > 0) {
    firstMessageChat = arrayLoadedMessages[arrayLoadedMessages.length - 1];
  }

  console.log("*** Datos del mensaje de arriba del todo en el chat ***");
  console.log("ID: " + firstMessageChat.id);
  console.log("Nombre: " + firstMessageChat.data().name);
  console.log("Texto: " + firstMessageChat.data().text);
  console.log("URL de imagen: " + firstMessageChat.data().imageUrl);
  console.log("Timestamp: " + firstMessageChat.data().timestamp);
  console.log("");

  let arrayMessages = await getPreviousFiveMessages(firstMessageChat);
  let currentDoc;

  for (var i = 0; i < arrayMessages.length; i++) {
    currentDoc = arrayMessages[i];

    displayMessage(currentDoc.id, currentDoc.data().timestamp, currentDoc.data().name, currentDoc.data().text, currentDoc.data().profilePicUrl, currentDoc.data().imageUrl,
    currentDoc.data().favorite);

    arrayLoadedMessages.push(currentDoc);
  }

}

/*
Devuelve el mensaje que aparece arriba del todo en el chat cuando en
este se muestran unicamente los tres mensajes mas recientes, lo cual
sucede cuando la consulta de la funcion loadMessages() tiene limit(3)
*/
function getFirstMessage() {
  const threeRecentMessageQuery = query(collection(getFirestore(), 'messages'), orderBy('timestamp', 'desc'), limit(3));

  return getDocs(threeRecentMessageQuery).then((querySnapshot) => {
    return querySnapshot.docs[querySnapshot.docs.length - 1];
  });
}

/*
Retorna un arreglo con los 5 mensajes anteriores al mensaje que aparece
arriba del todo en el chat de los tres mensajes mas recientes, ordenados
de forma descendente, es decir, del mas reciente al menos reciente
*/
function getPreviousFiveMessages(firstMessageChat) {
  const fivePreviousMessagesQuery = query(collection(getFirestore(), 'messages'), orderBy('timestamp', 'desc'), startAfter(firstMessageChat), limit(5));

  return getDocs(fivePreviousMessagesQuery).then((querySnapshot) => {
    return querySnapshot.docs;
  });
}

// Elimina todos los documentos correspondientes a los mensajes, por lo tanto, elimina todos los mensajes
function deleteAllDocs() {
  /*
  Comprueba que el usuario no este conectado, en cuyo caso el boton
  para eliminar todos los mensajes no debe realizar dicha eliminacion
  */
  if (!checkSignedInWithMessage()) {
    return;
  }

  // Obtiene todos los documentos correspondientes a los mensajes
  const messagesQuery = query(collection(getFirestore(), 'messages'));

  getDocs(messagesQuery).then((querySnapshot) => {
      querySnapshot.forEach((currentDoc) => {
        console.log("*** Datos del documento eliminado ***")
        console.log("ID: " + currentDoc.id);
        console.log("Nombre: " + currentDoc.data().name);
        console.log("Texto: " + currentDoc.data().text);
        console.log("URL de imagen: " + currentDoc.data().imageUrl);
        console.log("");

        // Elimina el mensaje de la GUI
        deleteMessage(currentDoc.id);
        deleteImage(currentDoc.data().imageUrl);

        /*
        Obtiene la referencia de un documento de la coleccion 'messages'
        para borrar de esta, el documento correspondiente a dicha referencia,
        logrando de esta forma borrar el mensaje correspondiente a dicho
        documento
        */
        deleteDoc(doc(getFirestore(), 'messages', currentDoc.id));
      });
  });

  /*
  Se vacia el arreglo arrayLoadedMessages para que se puedan cargar 5 mensajes
  anteriores a partir de mensajes nuevos, es decir, a partir de mensajes que
  son ingresados luego de eliminar todos los mensajes existentes
  */
  arrayLoadedMessages = [];
}

/*
Elimina el mensaje en el cual sucede el evento 'click' al presionar el
boton de eliminacion asociado a dicho mensaje
*/
async function deleteOneMessage(event) {
  /*
  Comprueba que el usuario no este conectado, en cuyo caso el boton
  para eliminar un mensaje no debe realizar dicha eliminacion
  */
  if (!checkSignedInWithMessage()) {
    return;
  }

  // Obtiene el acceso al boton que se presiono para eliminar un mensaje
  const givenButton = event.target;

  console.log("ID del documento eliminado: " + givenButton.dataset.messageId);
  console.log("")

  const docReference = doc(getFirestore(), 'messages', givenButton.dataset.messageId);
  const docSnap = await getDoc(docReference);

  // Elimina el mensaje de la GUI
  deleteMessage(docSnap.id);
  deleteImage(docSnap.data().imageUrl);
  deleteDoc(doc(getFirestore(), 'messages', givenButton.dataset.messageId));

  // El mensaje eliminado de la GUI tambien se elimina de arrayLoadedMessages
  if (arrayLoadedMessages.length > 0) {

    for(var i = 0; i < arrayLoadedMessages.length; i++) {

      if (arrayLoadedMessages[i].id == docSnap.id) {
        arrayLoadedMessages.splice(i, 1);
      }

    } // End for

  }

}

/*
Destaca o desestaca el mensaje en el cual sucede el evento 'click' al
presionar el boton de destacar mensaje asociado a dicho mensaje
*/
async function highlightMessage(event) {
  /*
  Comprueba que el usuario no este conectado, en cuyo caso el boton
  para destacar un mensaje no debe realizar dicha accion
  */
  if (!checkSignedInWithMessage()) {
    return;
  }

  // Obtiene el acceso al boton que se presiono para destacar un mensaje
  const givenButton = event.target;

  console.log("ID del documento destacado: " + givenButton.dataset.messageId);
  console.log("")

  const docReference = doc(getFirestore(), 'messages', givenButton.dataset.messageId);
  const docSnap = await getDoc(docReference);

  /*
  Si el atributo favorite del mensaje es falso al momento de la pulsacion del
  boton de destacar mensaje, se le asigna el valor true, y el icono de dicho
  boton cambia por el icono de una estrella rellena. Esto es para destacar un mensaje
  desestacado.
  */
  if (!docSnap.data().favorite) {
    givenButton.removeAttribute('class');
    givenButton.setAttribute('class', 'fa fa-star');

    updateDoc(docReference, {
      favorite: true
    });
  }

  /*
  Si el atributo favorite del mensaje es verdadero al momento de la pulsacion del
  boton de destacar mensaje, se le asigna el valor false, y el icono de dicho
  boton cambia por el icono de una estrella sin relleno. Esto es para desestacar un mensaje
  destacado.
  */
  if (docSnap.data().favorite) {
    givenButton.removeAttribute('class');
    givenButton.setAttribute('class', 'fa fa-star-o');

    updateDoc(docReference, {
      favorite: false
    });

    /*
    Si se muestra la lista de mensajes marcados como favoritos (lo cual sucede cuando la variable
    displayFavorites es verdera, lo cual a su vez sucede cuando se pulsa el boton de mostrar mensajes
    favoritos, el cual tiene como icono un grupo de estrellas), y en esta lista se desmarca un mensaje,
    se lo elimina de dicha lista. Esta eliminacion es llevada a cabo por las instrucciones que hay dentro
    de esta instruccion if.
    */
    if (displayFavorites) {
      /*
      Estas dos invocaciones permiten que en la lista que muestra unicamente los mensajes
      preferidos (cuando se presiona el boton de mostrar mensajes preferidos), se eliminen
      de la GUI los mensajes que se desmarcan como preferidos
      */
      deleteAllDocsFromGUI();
      displayFavoritesMessages();

      /*
      Este control permite que se muestre la lista con todos los mensajes no marcados
      como preferidos cuando se desmarcan todos los mensajes de la lista de mensajes
      preferidos
      */
      if (await noFavoriteMessages()) {
        displayAllMessages();
      }
    }

  } // End if

}

let displayFavorites = false;

/*
Muestra los mensajes favoritos, y muestra todos los mensajes, tanto los
favoritos como los que no estan marcados como favoritos
*/
async function displayMessages() {
  /*
  Comprueba que el usuario no este conectado, en cuyo caso el boton
  para visualizar unicamente los mensajes preferidos no debe mostrar
  dichos mensajes
  */
  if (!checkSignedInWithMessage()) {
    return;
  }

  /*
  Si no hay mensajes marcados como favoritos, no es posible mostrar
  unicamente dichos mensajes
  */
  if (await noFavoriteMessages()) {
    alert("No hay mensajes marcados como favoritos.");
    return;
  }

  /*
  Elimina todos los mensajes de la GUI, tanto los marcados como
  favoritos, como los que no estan marcados como favoritos, lo
  cual es necesario para mostrar todos los mensajes o unicamente
  los mensajes preferidos
  */
  deleteAllDocsFromGUI();

  if (!displayFavorites) {
    displayFavoritesMessages();
    displayFavorites = true;
    return;
  }

  displayAllMessages();
  displayFavorites = false;
}

// Muestra unicamente los mensajes marcados como favoritos
function displayFavoritesMessages() {
  const favoriteMessagesQuery = query(collection(getFirestore(), 'messages'), where("favorite", "==", true), orderBy('timestamp', 'desc'));

  getDocs(favoriteMessagesQuery).then((querySnapshot) => {
      querySnapshot.forEach((currentDoc) => {
        displayMessage(currentDoc.id, currentDoc.data().timestamp, currentDoc.data().name, currentDoc.data().text, currentDoc.data().profilePicUrl, currentDoc.data().imageUrl,
        currentDoc.data().favorite);
      });
  });
}

// Muestra todos los mensajes, los que no estan marcados como favoritos y los que si lo estan
function displayAllMessages() {
  const allMessagesQuery = query(collection(getFirestore(), 'messages'), orderBy('timestamp', 'desc'));

  getDocs(allMessagesQuery).then((querySnapshot) => {
      querySnapshot.forEach((currentDoc) => {
        displayMessage(currentDoc.id, currentDoc.data().timestamp, currentDoc.data().name, currentDoc.data().text, currentDoc.data().profilePicUrl, currentDoc.data().imageUrl,
        currentDoc.data().favorite);
      });
  });
}

// Elimina todos los mensajes de la interfaz grafica de usuario
function deleteAllDocsFromGUI() {
  const allMessagesQuery = query(collection(getFirestore(), 'messages'), orderBy('timestamp', 'desc'));

  getDocs(allMessagesQuery).then((querySnapshot) => {
      querySnapshot.forEach((currentDoc) => {
        deleteMessage(currentDoc.id);
      });
  });
}

// Retorna true si hay mensajes favoritos, false en caso contrario
function noFavoriteMessages() {
  const favoriteMessagesQuery = query(collection(getFirestore(), 'messages'), where("favorite", "==", true), orderBy('timestamp', 'desc'));

  return getDocs(favoriteMessagesQuery).then((querySnapshot) => {
    return querySnapshot.empty;
  });
}

// Elimina todos los mensajes excepto los preferidos
async function deleteAllExceptFavorites() {
  /*
  Comprueba que el usuario no este conectado, en cuyo caso el boton
  para eliminar todos los mensajes excepto los mensajes favoritos no
  debe realizar dicha accion
  */
  if (!checkSignedInWithMessage()) {
    return;
  }

  /*
  Si no hay mensajes cargados en la base de datos de Firebase, no
  es posible borrar todos los mensajes excepto los que estan
  marcados como favoritos
  */
  if (await noMessages()) {
    alert("No hay mensajes cargados para realizar esta accion (eliminar todos los mensajes, excepto los favoritos).");
    return;
  }

  /*
  Si hay mensajes, y no hay mensajes marcados como favoritos, se
  muestra un cuadro de confirmacion advirtiendo lo que sucedera en
  caso de continuar con la accion
  */
  if (!await noMessages() && await noFavoriteMessages()) {
    /*
    Si el usuario pulsa el boton de cancelacion, esta funcion no continua
    su flujo de ejecucion, sino que devuelve el control, mediante la instruccion
    return, a quien la haya invocado
    */
    if (!confirm('No hay mensajes marcados como favoritos, por lo tanto, se borrarán todos los mensajes en caso de continuar con esta accion.')) {
      return;
    }
  }

  const allMessagesQuery = query(collection(getFirestore(), 'messages'), orderBy('timestamp', 'desc'));

  getDocs(allMessagesQuery).then((querySnapshot) => {
      querySnapshot.forEach((currentDoc) => {
        /*
        Si el documento (mensaje) actualmente leido no esta marcado
        como favorito, se lo elimina de la GUI y de la base de datos
        de Firebase
        */
        if (!currentDoc.data().favorite) {
          // Elimina el mensaje de la GUI
          deleteMessage(currentDoc.id);
          deleteImage(currentDoc.data().imageUrl);
          deleteDoc(doc(getFirestore(), 'messages', currentDoc.id));
        }
      });
  });
}

// Retorna true si hay mensajes cargados en la base de datos de Firebase, false en caso contrario
function noMessages() {
  const allMessagesQuery = query(collection(getFirestore(), 'messages'), orderBy('timestamp', 'desc'));

  return getDocs(allMessagesQuery).then((querySnapshot) => {
    return querySnapshot.empty;
  });
}

// Elimina una imagen de la base de datos de Firebase
function deleteImage(imageUrl) {
  /*
  Si imageUrl no tiene el valor undefined, el documento del cual proviene,
  contiene una imagen, por lo tanto, se tiene que eliminar dicha imagen de
  Firebase
  */
  if (imageUrl !== undefined) {
    // Crea una referencia con el URL de la imagen del documento
    const httpsReference = ref(getStorage(), imageUrl);

    console.log("*** Datos de la imagen eliminada ***");
    console.log("fullPath: " + httpsReference.fullPath);
    console.log("file name:" + httpsReference.name);
    console.log("");

    // Create a child reference to the file to delete
    const desertRef = ref(getStorage(), httpsReference.fullPath);

    // Delete the file
    deleteObject(desertRef).then(() => {
      console.log("File deleted successfully");
      console.log("");
    }).catch((error) => {
      console.log("Uh-oh, an error occurred!");
      console.log(error);
    });
  }
}

// Saves a new message containing an image in Firebase.
// This first saves the image in Firebase storage.
async function saveImageMessage(file) {
  try {
    // 1 - We add a message with a loading icon that will get updated with the shared image.
    const messageRef = await addDoc(collection(getFirestore(), 'messages'), {
      name: getUserName(),
      imageUrl: LOADING_IMAGE_URL,
      profilePicUrl: getProfilePicUrl(),
      timestamp: serverTimestamp()
    });

    // 2 - Upload the image to Cloud Storage.
    const filePath = `${getAuth().currentUser.uid}/${messageRef.id}/${file.name}`;
    const newImageRef = ref(getStorage(), filePath);
    const fileSnapshot = await uploadBytesResumable(newImageRef, file);

    // 3 - Generate a public URL for the file.
    const publicImageUrl = await getDownloadURL(newImageRef);

    // 4 - Update the chat message placeholder with the image's URL.
    await updateDoc(messageRef,{
      imageUrl: publicImageUrl,
      storageUri: fileSnapshot.metadata.fullPath
    });
  } catch (error) {
    console.error('There was an error uploading a file to Cloud Storage:', error);
  }
}

// Saves the messaging device token to Cloud Firestore.
async function saveMessagingDeviceToken() {
  try {
    const currentToken = await getToken(getMessaging());
    if (currentToken) {
      console.log('Got FCM device token:', currentToken);
      // Saving the Device Token to Cloud Firestore.
      const tokenRef = doc(getFirestore(), 'fcmTokens', currentToken);
      await setDoc(tokenRef, { uid: getAuth().currentUser.uid });

      // This will fire when a message is received while the app is in the foreground.
      // When the app is in the background, firebase-messaging-sw.js will receive the message instead.
      onMessage(getMessaging(), (message) => {
        console.log(
          'New foreground notification from Firebase Messaging!',
          message.notification
        );
      });
    } else {
      // Need to request permissions to show notifications.
      requestNotificationsPermissions();
    }
  } catch(error) {
    console.error('Unable to get messaging token.', error);
  };
}

// Requests permissions to show notifications.
async function requestNotificationsPermissions() {
  console.log('Requesting notifications permission...');
  const permission = await Notification.requestPermission();

  if (permission === 'granted') {
    console.log('Notification permission granted.');
    // Notification permission granted.
    await saveMessagingDeviceToken();
  } else {
    console.log('Unable to get permission to notify.');
  }
}

// Triggered when a file is selected via the media picker.
function onMediaFileSelected(event) {
  event.preventDefault();
  var file = event.target.files[0];

  // Clear the selection in the file picker input.
  imageFormElement.reset();

  // Check if the file is an image.
  if (!file.type.match('image.*')) {
    var data = {
      message: 'You can only share images',
      timeout: 2000,
    };
    signInSnackbarElement.MaterialSnackbar.showSnackbar(data);
    return;
  }
  // Check if the user is signed-in
  if (checkSignedInWithMessage()) {
    saveImageMessage(file);
  }
}

// Triggered when the send new message form is submitted.
function onMessageFormSubmit(e) {
  e.preventDefault();

  console.log("Se ejecuto la funcion onMessageFormSubmit");
  console.log("");

  // Check that the user entered a message and is signed in.
  if (messageInputElement.value && checkSignedInWithMessage()) {
    saveMessage(messageInputElement.value).then(function () {
      // Clear message text field and re-enable the SEND button.
      resetMaterialTextfield(messageInputElement);
      toggleButton();
    });
  }
}

// Triggers when the auth state change for instance when the user signs-in or signs-out.
function authStateObserver(user) {
  if (user) {
    // User is signed in!
    // Get the signed-in user's profile pic and name.
    var profilePicUrl = getProfilePicUrl();
    var userName = getUserName();

    // Set the user's profile pic and name.
    userPicElement.style.backgroundImage =
      'url(' + addSizeToGoogleProfilePic(profilePicUrl) + ')';
    userNameElement.textContent = userName;

    // Show user's profile and sign-out button.
    userNameElement.removeAttribute('hidden');
    userPicElement.removeAttribute('hidden');
    signOutButtonElement.removeAttribute('hidden');

    // Hide sign-in button.
    signInButtonGoogle.setAttribute('hidden', 'true');
    signInButtonFacebook.setAttribute('hidden', 'true');

    // We save the Firebase Messaging Device token and enable notifications.
    saveMessagingDeviceToken();
  } else {
    // User is signed out!
    // Hide user's profile and sign-out button.
    userNameElement.setAttribute('hidden', 'true');
    userPicElement.setAttribute('hidden', 'true');
    signOutButtonElement.setAttribute('hidden', 'true');

    // Show sign-in button.
    signInButtonGoogle.removeAttribute('hidden');
    signInButtonFacebook.removeAttribute('hidden');
  }
}

// Returns true if user is signed-in. Otherwise false and displays a message.
function checkSignedInWithMessage() {
  // Return true if the user is signed in Firebase
  if (isUserSignedIn()) {
    return true;
  }

  // Display a message to the user using a Toast.
  var data = {
    message: 'You must sign-in first',
    timeout: 2000,
  };
  signInSnackbarElement.MaterialSnackbar.showSnackbar(data);
  return false;
}

// Resets the given MaterialTextField.
function resetMaterialTextfield(element) {
  element.value = '';
  element.parentNode.MaterialTextfield.boundUpdateClassesHandler();
}

// Template for messages.
var MESSAGE_TEMPLATE =
  '<div class="message-container">' +
  '<div class="spacing"><div class="pic"></div></div>' +
  '<div class="message"></div>' +
  '<div class="name"></div>';

// Adds a size to Google Profile pics URLs.
function addSizeToGoogleProfilePic(url) {
  if (url.indexOf('googleusercontent.com') !== -1 && url.indexOf('?') === -1) {
    return url + '?sz=150';
  }
  return url;
}

// A loading image URL.
var LOADING_IMAGE_URL = 'https://www.google.com/images/spin-32.gif?a';

// Delete a Message from the UI.
function deleteMessage(id) {
  var div = document.getElementById(id);
  // If an element for that message exists we delete it.
  if (div) {
    div.parentNode.removeChild(div);
  }
}

// Crea un boton de eliminacion de mensaje para cada mensaje ingresado
function createDeleteButton(messageId) {
  let deleteButtonElement = document.createElement('button');
  deleteButtonElement.innerHTML = "X";
  deleteButtonElement.setAttribute('id', 'delete-message');
  deleteButtonElement.setAttribute('data-message-id', messageId);
  deleteButtonElement.setAttribute('class', 'mdl-delete-button mdl-js-button mdl-delete-button--raised mdl-js-ripple-effect');

  /*
  Agrega un detector del evento 'click' para el boton de eliminacion
  de cada mensaje ingresado, y lo asocia a la funcion deleteOneMessage
  */
  deleteButtonElement.addEventListener('click', deleteOneMessage);

  return deleteButtonElement;
}

// Crea un boton de destacar mensaje para cada mensaje ingresado
function createFavoriteButton(messageId) {
  let favoriteButton = document.createElement('button');
  favoriteButton.setAttribute('id', 'favorite-message');
  favoriteButton.setAttribute('data-message-id', messageId);
  favoriteButton.setAttribute('class', 'fa fa-star-o');

  /*
  Agrega un detector del evento 'click' para el boton de destacar mensaje
  de cada mensaje ingresado, y lo asocia a la funcion highlightMessage
  */
  favoriteButton.addEventListener('click', highlightMessage);

  return favoriteButton;
}

function createAndInsertMessage(id, timestamp) {
  const container = document.createElement('div');
  container.innerHTML = MESSAGE_TEMPLATE;
  const div = container.firstChild;
  div.setAttribute('id', id);

  // Crea y añade un boton de eliminacion para cada mensaje ingresado
  div.appendChild(createDeleteButton(id));

  // Crea y añade un boton de destacar mensaje para cada mensaje ingresado
  div.appendChild(createFavoriteButton(id));

  // If timestamp is null, assume we've gotten a brand new message.
  // https://stackoverflow.com/a/47781432/4816918
  timestamp = timestamp ? timestamp.toMillis() : Date.now();
  div.setAttribute('timestamp', timestamp);

  // figure out where to insert new message
  const existingMessages = messageListElement.children;
  if (existingMessages.length === 0) {
    messageListElement.appendChild(div);
  } else {
    let messageListNode = existingMessages[0];

    while (messageListNode) {
      const messageListNodeTime = messageListNode.getAttribute('timestamp');

      if (!messageListNodeTime) {
        throw new Error(
          `Child ${messageListNode.id} has no 'timestamp' attribute`
        );
      }

      if (messageListNodeTime > timestamp) {
        break;
      }

      messageListNode = messageListNode.nextSibling;
    }

    messageListElement.insertBefore(div, messageListNode);
  }

  return div;
}

// Displays a Message in the UI.
function displayMessage(id, timestamp, name, text, picUrl, imageUrl, favorite) {
  var div =
    document.getElementById(id) || createAndInsertMessage(id, timestamp);

  // profile picture
  if (picUrl) {
    div.querySelector('.pic').style.backgroundImage =
      'url(' + addSizeToGoogleProfilePic(picUrl) + ')';
  }

  div.querySelector('.name').textContent = name;
  var messageElement = div.querySelector('.message');

  if (text) {
    // If the message is text.
    messageElement.textContent = text;
    // Replace all line breaks by <br>.
    messageElement.innerHTML = messageElement.innerHTML.replace(/\n/g, '<br>');
  } else if (imageUrl) {
    // If the message is an image.
    var image = document.createElement('img');
    image.addEventListener('load', function () {
      messageListElement.scrollTop = messageListElement.scrollHeight;
    });
    image.src = imageUrl + '&' + new Date().getTime();
    messageElement.innerHTML = '';
    messageElement.appendChild(image);
  }
  // Show the card fading-in and scroll to view the new message.
  setTimeout(function () {
    div.classList.add('visible');
  }, 1);
  messageListElement.scrollTop = messageListElement.scrollHeight;
  messageInputElement.focus();

  /*
  Si el mensaje a mostrar esta marcado como favorito, se cambia el icono
  del boton de marcar mensaje como favorito, asociado a dicho mensaje, por
  el icono de una estrella rellena
  */
  if (favorite) {
    const favoriteButton = div.children[4];
    favoriteButton.removeAttribute('class');
    favoriteButton.setAttribute('class', 'fa fa-star');
  }
}

// Enables or disables the submit button depending on the values of the input
// fields.
function toggleButton() {
  if (messageInputElement.value) {
    submitButtonElement.removeAttribute('disabled');
  } else {
    submitButtonElement.setAttribute('disabled', 'true');
  }
}

// Shortcuts to DOM Elements.
var messageListElement = document.getElementById('messages');
var messageFormElement = document.getElementById('message-form');
var messageInputElement = document.getElementById('message');
var submitButtonElement = document.getElementById('submit');
var imageButtonElement = document.getElementById('submitImage');
var imageFormElement = document.getElementById('image-form');
var mediaCaptureElement = document.getElementById('mediaCapture');
var userPicElement = document.getElementById('user-pic');
var userNameElement = document.getElementById('user-name');
var signInButtonGoogle = document.getElementById('sign-in-google');
var signInButtonFacebook = document.getElementById('sign-in-facebook');
var signOutButtonElement = document.getElementById('sign-out');
var signInSnackbarElement = document.getElementById('must-signin-snackbar');

var loadButtonElement = document.getElementById('load-five-messages');
loadButtonElement.addEventListener('click', loadPreviousFiveMessages);

var deleteAllButtonElement = document.getElementById('delete-all-messages');
deleteAllButtonElement.addEventListener('click', deleteAllDocs);

var favoritesButtonElement = document.getElementById('favorite-messages');
favoritesButtonElement.addEventListener('click', displayMessages);

var deleteNonFavoriteButton = document.getElementById('delete-non-favorite-messages');
deleteNonFavoriteButton.addEventListener('click', deleteAllExceptFavorites);

// Saves message on form submit.
messageFormElement.addEventListener('submit', onMessageFormSubmit);
signOutButtonElement.addEventListener('click', signOutUser);
signInButtonGoogle.addEventListener('click', signInGoogle);
signInButtonFacebook.addEventListener('click', signInFacebook);

// Toggle for the button.
messageInputElement.addEventListener('keyup', toggleButton);
messageInputElement.addEventListener('change', toggleButton);

// Events for image upload.
imageButtonElement.addEventListener('click', function (e) {
  e.preventDefault();
  mediaCaptureElement.click();
});
mediaCaptureElement.addEventListener('change', onMediaFileSelected);

const firebaseAppConfig = getFirebaseConfig();
// TODO 0: Initialize Firebase

// TODO 12: Initialize Firebase Performance Monitoring

initFirebaseAuth();
loadMessages();

// TODO: Enable Firebase Performance Monitoring.
getPerformance();
