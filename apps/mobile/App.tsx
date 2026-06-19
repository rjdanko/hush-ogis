import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hush</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0E1116",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#F4F6F8", fontSize: 28, fontWeight: "200", letterSpacing: 2 },
});
