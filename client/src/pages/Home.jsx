import Hero from '../components/Hero';
import HowItWorks from '../components/HowItWorks';
import Honest from '../components/Honest';
import MapSection from '../components/MapSection';
import Beyond from '../components/Beyond';
import ReportSection from '../components/ReportSection';
import Finale from '../components/Finale';
import { useReveal } from '../components/motion';

// The landing page, section by section (docs/COLOUR_SYSTEM.md 4.2); Finale is the closing call to action and the footer
const Home = () => {
  useReveal();   // scroll-in motion for every [data-rv] below
  return (<><Hero /><HowItWorks /><Honest /><MapSection /><Beyond /><ReportSection /><Finale /></>);
};

export default Home;
