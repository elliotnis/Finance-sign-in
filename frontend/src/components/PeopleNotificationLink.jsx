import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
export default function PeopleNotificationLink({email}) {
 const [count,setCount]=useState(0);
 useEffect(()=>{let live=true;const refresh=async()=>{try{const response=await fetch(`${import.meta.env.VITE_API_URL||(import.meta.env.DEV ? 'http://localhost:8000' : '/api')}/people/notifications`,{headers:{Authorization:`Bearer ${sessionStorage.getItem('portal_session')||''}`}});if(response.ok){const data=await response.json();if(live)setCount(data.notifications.filter(item=>!item.read).length);}}catch{/* The People Finder page provides retry and sign-in errors. */}};refresh();const timer=setInterval(refresh,30000);return()=>{live=false;clearInterval(timer);};},[email]);
 return <Link className="secondary-btn" to="/people?tab=notifications">Connections{count>0?` (${count})`:''}</Link>;
}
