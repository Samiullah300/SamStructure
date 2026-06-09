import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';

export default function App() {
  const [groqKey, setGroqKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [githubUser, setGithubUser] = useState('');
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [messages, setMessages] = useState([{
    role: 'system', 
    text: 'Hello! I am your AI Structural Engineer. Describe the building you want to design (e.g. "I want a 3-story concrete frame building with a slab").'
  }]);
  const [inputText, setInputText] = useState('');

  const handleSetupSave = () => {
    if (groqKey && githubToken && githubUser) {
      setIsSetupComplete(true);
    } else {
      alert("Please fill in all fields.");
    }
  };

  const callGroqAPI = async (prompt) => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: 'You are an expert structural engineer. The user will describe a building. You must extract the parameters and return ONLY a valid JSON object matching this schema: {"name": "string", "nodes": [{"id": int, "x": float, "y": float, "z": float, "fixed": [int,int,int,int,int,int]}], "beams": [{"id": int, "iNode": int, "jNode": int, "section": "string"}], "columns": [], "slabs": []}. DO NOT RETURN ANY TEXT OUTSIDE THE JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1
      })
    });
    
    if (!response.ok) throw new Error("Groq API failed: " + response.statusText);
    const data = await response.json();
    return data.choices[0].message.content;
  };

  const triggerGitHubAction = async (buildingJsonStr) => {
    const repoName = "SamStructure"; 
    
    // 1. We would typically push the building.json directly to trigger the push event,
    // but using repository_dispatch is cleaner for API triggers.
    // Since our backend triggers on push to building.json, we use the GitHub API to update the file directly.
    
    // For simplicity in this demo phase, we just trigger a dispatch event.
    // You'll need to modify your run_fea.yml to listen for 'repository_dispatch'.
    
    const response = await fetch(`https://api.github.com/repos/${githubUser}/${repoName}/dispatches`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${githubToken}`,
      },
      body: JSON.stringify({
        event_type: 'run_fea',
        client_payload: {
          building_data: buildingJsonStr
        }
      })
    });
    
    if (!response.ok) {
      const errTxt = await response.text();
      throw new Error("GitHub API failed: " + errTxt);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    
    const userMsg = { role: 'user', text: inputText };
    setMessages(prev => [...prev, userMsg]);
    const currentInput = inputText;
    setInputText('');
    setIsLoading(true);

    try {
      // 1. Get JSON from Groq
      setMessages(prev => [...prev, { role: 'system', text: 'Analyzing structure...' }]);
      const aiResponseText = await callGroqAPI(currentInput);
      
      // Clean up the JSON (sometimes LLMs wrap in markdown)
      const cleanJsonStr = aiResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // 2. Trigger GitHub Actions
      setMessages(prev => [...prev, { role: 'system', text: 'Triggering GitHub FEA Engine...' }]);
      await triggerGitHubAction(cleanJsonStr);
      
      setMessages(prev => [...prev, { role: 'ai', text: `Success! I have extracted the structure and triggered the FEA server on GitHub. The server is analyzing your building right now. Check your GitHub Actions tab!` }]);
      
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSetupComplete) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.setupCard}>
          <Text style={styles.title}>SamStruture Setup</Text>
          <Text style={styles.subtitle}>Enter your free API keys to get started.</Text>
          
          <TextInput 
            style={styles.input} 
            placeholder="Groq API Key (AI Chat)" 
            secureTextEntry
            value={groqKey}
            onChangeText={setGroqKey}
          />
          <TextInput 
            style={styles.input} 
            placeholder="GitHub Personal Access Token" 
            secureTextEntry
            value={githubToken}
            onChangeText={setGithubToken}
          />
          <TextInput 
            style={styles.input} 
            placeholder="GitHub Username" 
            value={githubUser}
            onChangeText={setGithubUser}
          />
          
          <TouchableOpacity style={styles.button} onPress={handleSetupSave}>
            <Text style={styles.buttonText}>Save & Start</Text>
          </TouchableOpacity>
        </View>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={{ flex: 1, width: '100%' }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.headerText}>SamStruture AI</Text>
        </View>
        
        <ScrollView style={styles.chatArea} contentContainerStyle={{ padding: 15 }}>
          {messages.map((msg, idx) => (
            <View key={idx} style={[
              styles.messageBubble, 
              msg.role === 'user' ? styles.userBubble : 
              msg.role === 'system' ? styles.systemBubble : styles.aiBubble
            ]}>
              <Text style={[
                msg.role === 'user' ? styles.userText : 
                msg.role === 'system' ? styles.systemText : styles.aiText
              ]}>{msg.text}</Text>
            </View>
          ))}
          {isLoading && <ActivityIndicator size="large" color="#007AFF" style={{marginTop: 10}} />}
        </ScrollView>

        <View style={styles.inputArea}>
          <TextInput 
            style={styles.chatInput} 
            placeholder="E.g., Design a 3 story concrete frame..." 
            value={inputText}
            onChangeText={setInputText}
            multiline
            editable={!isLoading}
          />
          <TouchableOpacity style={[styles.sendButton, isLoading && {backgroundColor: '#ccc'}]} onPress={handleSendMessage} disabled={isLoading}>
            <Text style={styles.buttonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  setupCard: { width: '90%', backgroundColor: '#fff', padding: 20, borderRadius: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 15, backgroundColor: '#fafafa' },
  button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  header: { padding: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center', marginTop: 40 },
  headerText: { fontSize: 18, fontWeight: 'bold' },
  chatArea: { flex: 1 },
  messageBubble: { padding: 12, borderRadius: 10, marginBottom: 10, maxWidth: '80%' },
  userBubble: { backgroundColor: '#007AFF', alignSelf: 'flex-end' },
  aiBubble: { backgroundColor: '#fff', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#eee' },
  systemBubble: { backgroundColor: 'transparent', alignSelf: 'center', marginVertical: 5 },
  userText: { color: '#fff' },
  aiText: { color: '#333' },
  systemText: { color: '#888', fontStyle: 'italic', fontSize: 12 },
  inputArea: { flexDirection: 'row', padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', marginBottom: 20 },
  chatInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 10, maxHeight: 100, backgroundColor: '#fafafa' },
  sendButton: { backgroundColor: '#007AFF', borderRadius: 20, paddingHorizontal: 15, justifyContent: 'center', marginLeft: 10 }
});
