import Video from "./pages/Video"
import CustomTitleBar from "./components/CustomTitleBar"
import "./components/CustomTitleBar.css"
import "./App.css"

function App(): React.JSX.Element {

  return (
    <div className="app-container">
      <CustomTitleBar title="茄条AI - 视频处理" />
      <div className="app-main-header">
        <div className="app-center-title">
          <p>茄条</p>
          <p>AI</p>
        </div>
        <div className="app-center-desc">
          <p>赶上AI浪潮，让AI智能体帮你跑赢2026</p>
        </div>
      </div>
      <Video />
    </div>
  )
}

export default App
