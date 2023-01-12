import React, {useEffect, useState} from 'react';
import {View, StyleSheet} from 'react-native';
import {NavigationContainer} from '@react-navigation/native'
import Navigator from './src/routes/loginStack';
import Station from './src/routes/navBar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from 'react-query';
import Loading from './src/components/Loading/Loading'
import TempMap from './src/screens/Start/TempMap';

import {
  Colors,
} from 'react-native/Libraries/NewAppScreen';

const queryClient = new QueryClient();

const App = () => {
  const [isLoggedIn, setLoggedIn] = useState(false)
  const [isLoading, setLoading] = useState(true)

  const start = async () => {
    const email = await AsyncStorage.getItem('email');
    console.log('========email', email)
    const password = await AsyncStorage.getItem('password');
    console.log('========password', password)

    if(email != null && password != null) {
        console.log('Email ======= ', email)
        setLoggedIn(true)
    }
    else{
        console.log('False ======= ')
        setLoggedIn(false)
    }
    setLoading(false)
  }

  useEffect(() => {
    start()
  })

  return (
    // <View>
    //   <TempMap/>
    // </View>
    <>
      {
        isLoading ? <View><Loading/></View>: <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          {/* <Navigator/> */}
          {
            isLoggedIn ? <Station/> : <Navigator/> 
          }
        </NavigationContainer>
      </QueryClientProvider>
      }
    </>
   );
 };

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#F9FBFC',
  }
});

export default App;